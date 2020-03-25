import { ApiPromise, WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { UserInfo } from '@joystream/types/lib/members';
import { assert } from 'chai';
import BN from 'bn.js';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';

let api: ApiPromise;
//let nonce: BN;
let keyring: Keyring;

describe('Membership integration tests', function() {
  before(async function() {
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    keyring = new Keyring({ type: 'sr25519' });
  });

  it('Buy membeship is accepted with sufficient funds and rejected with insufficient', async function() {
    const alice = keyring.addFromUri('//Alice');
    const bob = keyring.addFromUri('//Bob');

    await signAndSend(
      api.tx.members.buyMembership(
        0,
        new UserInfo({ handle: 'alice_member', avatar_uri: '', about: '' })
      ),
      alice
    );
    let aliceMembership = await api.query.members.memberIdByAccountId(
      alice.address
    );
    assert(!aliceMembership.isEmpty, 'Alice is not a member');
    //TODO ensure bob's balance is insufficient to buy membership but sufficient to pay fee
    await signAndSend(
      api.tx.members.buyMembership(
        0,
        new UserInfo({ handle: 'bob_member', avatar_uri: '', about: '' })
      ),
      bob
    );
    let bobMembership = await api.query.members.memberIdByAccountId(
      bob.address
    );
    assert(bobMembership.isEmpty, 'Bob is a member');
    //TODO membership cost and estimated fee should be retrived from chain
    await signAndSend(api.tx.balances.transfer(bob.address, 200), alice);
    //TODO ensure bob's balance is insufficient to buy membership
    await signAndSend(
      api.tx.members.buyMembership(
        0,
        new UserInfo({ handle: 'bob_member', avatar_uri: '', about: '' })
      ),
      bob
    );
    bobMembership = await api.query.members.memberIdByAccountId(bob.address);
    assert(!bobMembership.isEmpty, 'Bob is a not member');
  }).timeout(60000);

  after(function() {
    api.disconnect();
  });
});

async function signAndSend(
  tx: SubmittableExtrinsic<'promise'>,
  account: KeyringPair
) {
  await new Promise(async (resolve, reject) => {
    let nonce = await getNonce(account, api);
    const signedTx = tx.sign(account, { nonce });

    console.log('tx signed for ' + account.address);
    await signedTx
      .send(async result => {
        console.log('status ' + result.status);
        if (result.status.isFinalized == true) {
          console.log('tx succeed');
          resolve(true);
        } else if (result.status.isInvalid) {
          console.log('tx is invalid');
          resolve(true);
        }
      })
      .catch(error => {
        console.log('error during tx sending');
        resolve(true);
        // reject(error);
      });
  });
}

async function getNonce(account: KeyringPair, api: ApiPromise) {
  let nonceString = (
    await api.query.system.accountNonce(account.address)
  ).toString();
  return new BN(nonceString);
}
