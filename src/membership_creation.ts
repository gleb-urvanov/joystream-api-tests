import { ApiPromise, WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { UserInfo, PaidMembershipTerms } from '@joystream/types/lib/members';
import { assert } from 'chai';
import BN from 'bn.js';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { KeyringPair } from '@polkadot/keyring/types';

let api: ApiPromise;
let keyring: Keyring;
let alice: KeyringPair;
let bob: KeyringPair;

describe('Membership integration tests', function() {
  before(async function() {
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    keyring = new Keyring({ type: 'sr25519' });
  });

  it('Buy membeship is accepted with sufficient funds and rejected with insufficient', async function() {
    alice = keyring.addFromUri('//Alice');
    bob = keyring.addFromUri('//Bob');
    await signAndSend(api.tx.balances.transfer(bob.address, 2), alice);
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
    //TODO ensure bob's balance is insufficient to buy membership
    await signAndSend(
      api.tx.members.buyMembership(
        0,
        new UserInfo({ handle: 'bob_member', avatar_uri: '', about: '' })
      ),
      bob,
      true
    );
    let bobMembership = await api.query.members.memberIdByAccountId(
      bob.address
    );
    assert(bobMembership.isEmpty, 'Bob is a member');
    //TODO membership cost should be retrived from chain
    await signAndSend(api.tx.balances.transfer(bob.address, 100), alice);
    //TODO ensure bob's balance is sufficient to buy membership
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
  account: KeyringPair,
  expectFailure = false
) {
  await new Promise(async (resolve, reject) => {
    let nonce = await getNonce(account, api);
    const signedTx = tx.sign(account, { nonce });

    console.log('tx signed for ' + account.address);
    await signedTx
      .send(async result => {
        if (result.status.isFinalized == true && result.events != undefined) {
          result.events.forEach(event => {
            if (event.event.method == 'ExtrinsicFailed') {
              if (expectFailure) {
                resolve();
              } else {
                reject(new Error('Extrinsic failed unexpectedly'));
              }
            }
          });
          resolve();
        }
      })
      .catch(error => {
        reject(error);
      });
  });
}

async function getNonce(account: KeyringPair, api: ApiPromise) {
  let nonceString = (
    await api.query.system.accountNonce(account.address)
  ).toString();
  return new BN(nonceString);
}
