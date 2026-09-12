import { describe, it, expect, vi } from 'vitest';
import { Account, Asset, Contract, Keypair, Operation, StrKey, TransactionBuilder } from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

// Real, checksum-valid contract strkeys derived from arbitrary fixed byte patterns — a
// hand-typed "CAAAA...AAA" string would fail StrKey's own checksum validation, since
// contract addresses aren't just any 56-character string starting with C.
const CONTRACT_ID_A = StrKey.encodeContract(Buffer.alloc(32, 1));
const CONTRACT_ID_B = StrKey.encodeContract(Buffer.alloc(32, 2));

/** Builds a real, correctly-structured (if unsigned) transaction invoking `contractId` —
 * enough for TransactionBuilder.fromXDR to parse it back and for the policy engine to
 * inspect its real operations, which is all `isContractAllowed`/`extractUserAddress` ever
 * do. Signing doesn't matter here: the policy engine never verifies a signature, it only
 * reads the transaction's own structure. */
function buildInvokeXdr(sourcePublicKey: string, contractId: string): string {
  const account = new Account(sourcePublicKey, '1');
  const op = new Contract(contractId).call('some_function');
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(op)
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

/** A transaction with no Soroban invocation at all — a plain classic payment. */
function buildPaymentXdr(sourcePublicKey: string, destinationPublicKey: string): string {
  const account = new Account(sourcePublicKey, '1');
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(
      Operation.payment({
        destination: destinationPublicKey,
        asset: (require('@stellar/stellar-sdk') as typeof import('@stellar/stellar-sdk')).Asset.native(),
        amount: '10',
      })
    )
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

async function freshModule(sponsorPoliciesJson?: string) {
  if (sponsorPoliciesJson === undefined) {
    delete process.env.SPONSOR_POLICIES_JSON;
  } else {
    process.env.SPONSOR_POLICIES_JSON = sponsorPoliciesJson;
  }
  process.env.PER_KEY_DAILY_BUDGET_STROOPS = '0';
  vi.resetModules();
  return import('../src/relayer/policy');
}

describe('sponsorship policy engine', () => {
  it('getPolicyForKey returns the default policy for a key with no override configured', async () => {
    const { getPolicyForKey } = await freshModule();
    const policy = getPolicyForKey('unknown-key');
    expect(policy.dailyBudgetStroops).toBe(0);
    expect(policy.maxSponsoredTxPerUserPerDay).toBe(0);
    expect(policy.allowedContractIds).toBeUndefined();
  });

  it('getPolicyForKey merges a configured override on top of the default policy', async () => {
    const { getPolicyForKey } = await freshModule(
      JSON.stringify({ 'dapp-a': { maxSponsoredTxPerUserPerDay: 5, allowedContractIds: ['CCONTRACT1'] } })
    );
    const policy = getPolicyForKey('dapp-a');
    expect(policy.maxSponsoredTxPerUserPerDay).toBe(5);
    expect(policy.allowedContractIds).toEqual(['CCONTRACT1']);
    // Unspecified fields still fall back to the default.
    expect(policy.dailyBudgetStroops).toBe(0);
  });

  it('a key with no matching entry in SPONSOR_POLICIES_JSON still gets the default policy', async () => {
    const { getPolicyForKey } = await freshModule(JSON.stringify({ 'dapp-a': { maxSponsoredTxPerUserPerDay: 5 } }));
    const policy = getPolicyForKey('dapp-b');
    expect(policy.maxSponsoredTxPerUserPerDay).toBe(0);
  });

  it('malformed SPONSOR_POLICIES_JSON is ignored, falling back to default policies for everyone', async () => {
    const { getPolicyForKey } = await freshModule('{not valid json');
    expect(getPolicyForKey('dapp-a').maxSponsoredTxPerUserPerDay).toBe(0);
  });

  it('isContractAllowed allows anything when no allowlist is configured', async () => {
    const { isContractAllowed, getPolicyForKey } = await freshModule();
    const policy = getPolicyForKey('any-key');
    const source = Keypair.random().publicKey();
    const xdr = buildInvokeXdr(source, CONTRACT_ID_A);

    const result = isContractAllowed(policy, xdr, NETWORK_PASSPHRASE);
    expect(result.ok).toBe(true);
  });

  it('isContractAllowed allows a call to a contract that is on the allowlist', async () => {
    const { isContractAllowed } = await freshModule(
      JSON.stringify({ 'dapp-a': { allowedContractIds: [CONTRACT_ID_A] } })
    );
    const { getPolicyForKey } = await import('../src/relayer/policy');
    const policy = getPolicyForKey('dapp-a');
    const source = Keypair.random().publicKey();
    const xdr = buildInvokeXdr(source, CONTRACT_ID_A);

    expect(isContractAllowed(policy, xdr, NETWORK_PASSPHRASE).ok).toBe(true);
  });

  it('isContractAllowed rejects a call to a contract that is NOT on the allowlist', async () => {
    const { isContractAllowed, getPolicyForKey } = await freshModule(
      JSON.stringify({ 'dapp-a': { allowedContractIds: [CONTRACT_ID_A] } })
    );
    const policy = getPolicyForKey('dapp-a');
    const source = Keypair.random().publicKey();
    const xdr = buildInvokeXdr(source, CONTRACT_ID_B);

    const result = isContractAllowed(policy, xdr, NETWORK_PASSPHRASE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(CONTRACT_ID_B);
    }
  });

  it('isContractAllowed allows a plain payment (no contract invocation) even with an allowlist configured', async () => {
    const { isContractAllowed, getPolicyForKey } = await freshModule(
      JSON.stringify({ 'dapp-a': { allowedContractIds: [CONTRACT_ID_A] } })
    );
    const policy = getPolicyForKey('dapp-a');
    const source = Keypair.random().publicKey();
    const dest = Keypair.random().publicKey();
    const xdr = buildPaymentXdr(source, dest);

    expect(isContractAllowed(policy, xdr, NETWORK_PASSPHRASE).ok).toBe(true);
  });

  it('extractUserAddress returns the real transaction source account', async () => {
    const { extractUserAddress } = await freshModule();
    const source = Keypair.random().publicKey();
    const xdr = buildInvokeXdr(source, CONTRACT_ID_A);

    expect(extractUserAddress(xdr, NETWORK_PASSPHRASE)).toBe(source);
  });

  it('checkAndRecordUserSponsorship allows up to the configured cap, then rejects the next attempt', async () => {
    const { checkAndRecordUserSponsorship } = await freshModule();
    const policy = { dailyBudgetStroops: 0, maxSponsoredTxPerUserPerDay: 2, allowedContractIds: undefined };
    const user = Keypair.random().publicKey();

    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(true);
    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(true);
    const third = checkAndRecordUserSponsorship(policy, 'dapp-a', user);
    expect(third.ok).toBe(false);
  });

  it('checkAndRecordUserSponsorship treats 0 as unlimited', async () => {
    const { checkAndRecordUserSponsorship } = await freshModule();
    const policy = { dailyBudgetStroops: 0, maxSponsoredTxPerUserPerDay: 0, allowedContractIds: undefined };
    const user = Keypair.random().publicKey();

    for (let i = 0; i < 10; i++) {
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(true);
    }
  });

  it('different users under the same dApp key have independent caps', async () => {
    const { checkAndRecordUserSponsorship } = await freshModule();
    const policy = { dailyBudgetStroops: 0, maxSponsoredTxPerUserPerDay: 1, allowedContractIds: undefined };
    const userA = Keypair.random().publicKey();
    const userB = Keypair.random().publicKey();

    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', userA).ok).toBe(true);
    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', userA).ok).toBe(false);
    // userB has never been recorded — must still have their own full cap available.
    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', userB).ok).toBe(true);
  });

  it('releaseUserSponsorship rolls back a reservation, freeing headroom for the same user', async () => {
    const { checkAndRecordUserSponsorship, releaseUserSponsorship } = await freshModule();
    const policy = { dailyBudgetStroops: 0, maxSponsoredTxPerUserPerDay: 1, allowedContractIds: undefined };
    const user = Keypair.random().publicKey();

    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(true);
    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(false);

    releaseUserSponsorship('dapp-a', user);
    expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(true);
  });

  describe('verified-tier sponsorship cap (stellar-zkident integration)', () => {
    it('an unverified user still gets exactly maxSponsoredTxPerUserPerDay when no verified tier is configured', async () => {
      const { checkAndRecordUserSponsorship } = await freshModule();
      const policy = { dailyBudgetStroops: 0, maxSponsoredTxPerUserPerDay: 1, allowedContractIds: undefined };
      const user = Keypair.random().publicKey();

      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, false).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, false).ok).toBe(false);
    });

    it('calling with no verified argument at all behaves exactly as before this integration existed', async () => {
      const { checkAndRecordUserSponsorship } = await freshModule();
      const policy = { dailyBudgetStroops: 0, maxSponsoredTxPerUserPerDay: 1, allowedContractIds: undefined };
      const user = Keypair.random().publicKey();

      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user).ok).toBe(false);
    });

    it('a verified user gets the higher maxSponsoredTxPerVerifiedUserPerDay cap instead of the base one', async () => {
      const { checkAndRecordUserSponsorship } = await freshModule();
      const policy = {
        dailyBudgetStroops: 0,
        maxSponsoredTxPerUserPerDay: 1,
        maxSponsoredTxPerVerifiedUserPerDay: 3,
        allowedContractIds: undefined,
      };
      const user = Keypair.random().publicKey();

      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, true).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, true).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, true).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, true).ok).toBe(false);
    });

    it('maxSponsoredTxPerVerifiedUserPerDay: 0 means unlimited for verified users even when the base cap is finite', async () => {
      const { checkAndRecordUserSponsorship } = await freshModule();
      const policy = {
        dailyBudgetStroops: 0,
        maxSponsoredTxPerUserPerDay: 1,
        maxSponsoredTxPerVerifiedUserPerDay: 0,
        allowedContractIds: undefined,
      };
      const user = Keypair.random().publicKey();

      for (let i = 0; i < 10; i++) {
        expect(checkAndRecordUserSponsorship(policy, 'dapp-a', user, true).ok).toBe(true);
      }
    });

    it('verified and unverified users under the same dApp key have independent caps and independent counts', async () => {
      const { checkAndRecordUserSponsorship } = await freshModule();
      const policy = {
        dailyBudgetStroops: 0,
        maxSponsoredTxPerUserPerDay: 1,
        maxSponsoredTxPerVerifiedUserPerDay: 2,
        allowedContractIds: undefined,
      };
      const verifiedUser = Keypair.random().publicKey();
      const unverifiedUser = Keypair.random().publicKey();

      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', unverifiedUser, false).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', unverifiedUser, false).ok).toBe(false);

      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', verifiedUser, true).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', verifiedUser, true).ok).toBe(true);
      expect(checkAndRecordUserSponsorship(policy, 'dapp-a', verifiedUser, true).ok).toBe(false);
    });
  });
});
