import { KeyringPair } from '@polkadot/keyring/types';
import { SubmittableExtrinsic } from '@polkadot/api/types';
import { ApiPromise } from '@polkadot/api';
import BN = require('bn.js');

export class Utils {
  public static async signAndSend(
    tx: SubmittableExtrinsic<'promise'>,
    account: KeyringPair,
    nonce: BN,
    expectFailure = false
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const signedTx = tx.sign(account, { nonce });

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

  public static async getNonce(
    api: ApiPromise,
    account: KeyringPair
  ): Promise<BN> {
    return api.query.system
      .accountNonce(account.address)
      .then(nonce => new BN(nonce.toString()));
  }
}
