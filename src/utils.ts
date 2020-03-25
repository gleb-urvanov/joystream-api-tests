import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ApiPromise } from '@polkadot/api';
import BN = require('bn.js');

export async function signAndSend(
  tx: SubmittableExtrinsic<'promise'>,
  account: KeyringPair,
  nonce: BN,
  expectFailure = false
) {
  await new Promise(async (resolve, reject) => {
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

export async function getNonce(account: KeyringPair, api: ApiPromise) {
  let nonceString = (
    await api.query.system.accountNonce(account.address)
  ).toString();
  return new BN(nonceString);
}
