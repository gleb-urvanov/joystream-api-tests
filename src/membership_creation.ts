import { ApiPromise, WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { UserInfo, PaidTermId } from '@joystream/types/lib/members';
import { assert } from 'chai';
import BN from 'bn.js';

let api: ApiPromise;
let nonce: BN;
let keyring: Keyring;

describe('Membership integration tests', function() {
  before(async function() {
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    keyring = new Keyring({ type: 'sr25519' });
    let nonceString = (
      await api.query.system.accountNonce(keyring.addFromUri('//Alice').address)
    ).toString();
    nonce = new BN(nonceString);
  });

  it('Buy membeship is accepted with sufficient funds and rejected with insufficient', async function() {
    const alice = keyring.addFromUri('//Alice');
    const bob = keyring.addFromUri('//Bob');
    await api.tx.members
      .buyMembership(
        0,
        new UserInfo({ handle: 'alice_member', avatar_uri: '', about: '' })
      )
      .signAndSend(alice, { nonce });
    nonce = nonce.add(new BN(1));
    let aliceMembership = await api.query.members.memberIdByAccountId(
      alice.address
    );
    assert(!aliceMembership.isEmpty, 'Alice is not a member');
    //TODO ensure bob's balance is insufficient to buy membership but sufficient to pay fee
    await api.tx.members
      .buyMembership(
        0,
        new UserInfo({ handle: 'bob_member', avatar_uri: '', about: '' })
      )
      .signAndSend(bob);
    let bobMembership = await api.query.members.memberIdByAccountId(
      bob.address
    );
    assert(bobMembership.isEmpty, 'Bob is a member');
    //TODO membership cost and estimated fee should be retrived from chain
    await api.tx.balances
      .transfer(bob.address, 200)
      .signAndSend(alice, { nonce });
    //TODO ensure bob's balance is insufficient to buy membership
    await api.tx.members
      .buyMembership(
        0,
        new UserInfo({ handle: 'bob_member', avatar_uri: '', about: '' })
      )
      .signAndSend(bob, { nonce });
    bobMembership = await api.query.members.memberIdByAccountId(bob.address);
    assert(!bobMembership.isEmpty, 'Bob is a not member');
  });

  after(function() {
    api.disconnect();
  });
});
