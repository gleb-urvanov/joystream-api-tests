import { ApiPromise, WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { UserInfo, PaidMembershipTerms } from '@joystream/types/lib/members';
import { assert } from 'chai';
import { KeyringPair } from '@polkadot/keyring/types';
import { Utils } from './utils';
import { Option } from '@polkadot/types';
import { Balance } from '@polkadot/types/interfaces';
import BN = require('bn.js');

describe('Membership integration tests', function() {
  let api: ApiPromise;
  const keyring = new Keyring({ type: 'sr25519' });
  let alice: KeyringPair;
  let nKeyPairs: Array<KeyringPair> = new Array();
  let aKeyPair: KeyringPair;
  const N: number = 1;
  let membershipFee: number;

  before(async function() {
    this.timeout(30000);
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    alice = keyring.addFromUri('//Alice');
    for (let i = 0; i < N; i++) {
      nKeyPairs.push(keyring.addFromUri(i.toString()));
    }
    aKeyPair = keyring.addFromUri('A');
    membershipFee = await getMembershipFee(api, 0);
    //TODO introduce a global nonce management
    let nonce = await Utils.getNonce(api, alice);
    nonce = nonce.sub(new BN(1));
    await transferBalanceToAccounts(
      api,
      alice,
      nKeyPairs,
      membershipFee + 1,
      nonce
    );
    await transferBalance(api, alice, aKeyPair.address, 2);
  });

  it('Buy membeship is accepted with sufficient funds', async function() {
    await Promise.all(
      nKeyPairs.map(async keyPair => {
        await buyMembership(api, keyPair, 0, 'new_member');
      })
    );
    nKeyPairs.map(keyPair =>
      getMembership(api, keyPair.address).then(membership =>
        assert(!membership.isEmpty, 'Account m is not a member')
      )
    );
  }).timeout(30000);

  it('Accont A has insufficient funds to buy membership', async function() {
    getBalance(api, aKeyPair.address).then(balance =>
      assert(
        balance.toNumber() < membershipFee,
        'Account A already have sufficient balance to purchase membership'
      )
    );
  }).timeout(30000);

  it('Account A can not buy the membership with insufficient funds', async function() {
    await buyMembership(api, aKeyPair, 0, 'late_member', true);
    getMembership(api, aKeyPair.address).then(membership =>
      assert(membership.isEmpty, 'Account A is a member')
    );
  }).timeout(30000);

  it('Account A has been provided with funds to buy the membership', async function() {
    await transferBalance(api, alice, aKeyPair.address, membershipFee);
    getBalance(api, aKeyPair.address).then(balance =>
      assert(
        balance.toNumber() >= membershipFee,
        'The account balance is insufficient to purchase membership'
      )
    );
  }).timeout(30000);

  it('Account A was able to buy the membership', async function() {
    await buyMembership(api, aKeyPair, 0, 'late_member');
    getMembership(api, aKeyPair.address).then(membership =>
      assert(!membership.isEmpty, 'Account A is a not member')
    );
  }).timeout(30000);

  after(function() {
    api.disconnect();
  });
});

async function buyMembership(
  api: ApiPromise,
  account: KeyringPair,
  paidTerms: number,
  name: string,
  expectFailure = false
) {
  return Utils.signAndSend(
    api.tx.members.buyMembership(
      paidTerms,
      new UserInfo({ handle: name, avatar_uri: '', about: '' })
    ),
    account,
    await Utils.getNonce(api, account),
    expectFailure
  );
}

function getMembership(api: ApiPromise, address: string): Promise<any> {
  return api.query.members.memberIdsByControllerAccountId(address);
}

function getBalance(api: ApiPromise, address: string): Promise<Balance> {
  return api.query.balances.freeBalance<Balance>(address);
}

async function transferBalance(
  api: ApiPromise,
  from: KeyringPair,
  to: string,
  amount: number,
  nonce: BN = new BN(-1)
): Promise<void> {
  let _nonce = nonce.isNeg() ? await Utils.getNonce(api, from) : nonce;
  return Utils.signAndSend(api.tx.balances.transfer(to, amount), from, _nonce);
}

function getPaidMembershipTerms(
  api: ApiPromise,
  paidTermsId: number
): Promise<Option<PaidMembershipTerms>> {
  return api.query.members.paidMembershipTermsById<Option<PaidMembershipTerms>>(
    paidTermsId
  );
}

function getMembershipFee(
  api: ApiPromise,
  paidTermsId: number
): Promise<number> {
  return getPaidMembershipTerms(api, paidTermsId).then(terms =>
    terms.unwrap().fee.toNumber()
  );
}

async function transferBalanceToAccounts(
  api: ApiPromise,
  from: KeyringPair,
  to: Array<KeyringPair>,
  amount: number,
  nonce: BN
): Promise<void[]> {
  return Promise.all(
    to.map(async keyPair => {
      nonce = nonce.add(new BN(1));
      await transferBalance(api, from, keyPair.address, amount, nonce);
    })
  );
}
