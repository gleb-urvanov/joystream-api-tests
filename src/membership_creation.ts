import { ApiPromise, WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { UserInfo } from '@joystream/types/lib/members';
import { assert } from 'chai';
import { KeyringPair } from '@polkadot/keyring/types';
import { signAndSend, getNonce } from './utils';
import BN = require('bn.js');

let api: ApiPromise;
let keyring: Keyring;

describe('Membership integration tests', function() {
  before(async function() {
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    keyring = new Keyring({ type: 'sr25519' });
  });

  it('Buy membeship is accepted with sufficient funds and rejected with insufficient', async function() {
    let alice = keyring.addFromUri('//Alice');
    let bob = keyring.addFromUri('//Bob');
    await signAndSend(
      api.tx.balances.transfer(bob.address, 2),
      alice,
      await getNonce(alice, api)
    );
    await buyMembership(api, alice, new BN(0), 'alice_member');
    let aliceMembership = await api.query.members.memberIdByAccountId(
      alice.address
    );
    assert(!aliceMembership.isEmpty, 'Alice is not a member');
    //TODO ensure bob's balance is insufficient to buy membership
    await buyMembership(api, bob, new BN(0), 'bob_member', true);
    let bobMembership = await api.query.members.memberIdByAccountId(
      bob.address
    );
    assert(bobMembership.isEmpty, 'Bob is a member');
    //TODO membership cost should be retrived from chain
    await signAndSend(
      api.tx.balances.transfer(bob.address, 100),
      alice,
      await getNonce(alice, api)
    );
    //TODO ensure bob's balance is sufficient to buy membership
    await buyMembership(api, bob, new BN(0), 'bob_member');
    bobMembership = await api.query.members.memberIdByAccountId(bob.address);
    assert(!bobMembership.isEmpty, 'Bob is a not member');
  }).timeout(60000);

  after(function() {
    api.disconnect();
  });
});

async function buyMembership(
  api: ApiPromise,
  account: KeyringPair,
  paidTerms: BN,
  name: String,
  expectFailure = false
) {
  await signAndSend(
    api.tx.members.buyMembership(
      paidTerms,
      new UserInfo({ handle: name, avatar_uri: '', about: '' })
    ),
    account,
    await getNonce(account, api),
    expectFailure
  );
}
