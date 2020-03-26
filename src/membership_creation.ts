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
  let nKeyPairs: Array<KeyringPair>;
  let aKeyPair: KeyringPair;
  const N: number = 1;

  before(async function() {
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    alice = keyring.addFromUri('//Alice');
    nKeyPairs = new Array();
    for (let i = 0; i < N; i++) {
      nKeyPairs.push(keyring.addFromUri(i.toString()));
    }
    aKeyPair = keyring.addFromUri('A');
  });

  it('Buy membeship is accepted with sufficient funds and rejected with insufficient', async function() {
    let membershipFee = (
      await api.query.members.paidMembershipTermsById<
        Option<PaidMembershipTerms>
      >(0)
    )
      .unwrap()
      .fee.toNumber();

    let nonce = await Utils.getNonce(alice, api);
    nonce = nonce.sub(new BN(1));
    await Promise.all(
      nKeyPairs.map(async keyPair => {
        nonce = nonce.add(new BN(1));
        await transferBalance(
          api,
          alice,
          keyPair.address,
          membershipFee + 1,
          nonce
        );
      })
    );
    nonce = nonce.add(new BN(1));
    await transferBalance(api, alice, aKeyPair.address, 2, nonce);

    await Promise.all(
      nKeyPairs.map(async keyPair => {
        await buyMembership(api, keyPair, 0, 'new_member');
      })
    ).then(() => {
      nKeyPairs.map(async keyPair => {
        let keyPairMembership = await getMembership(keyPair.address);
        assert(!keyPairMembership.isEmpty, 'Account m is not a member');
      });
    });

    let accountBalance = (await getBalance(aKeyPair.address)).toNumber();
    assert(
      accountBalance < membershipFee,
      'Account A already have sufficient balance to purchase membership'
    );

    await buyMembership(api, aKeyPair, 0, 'late_member', true);
    let aMembership = await getMembership(aKeyPair.address);
    assert(aMembership.isEmpty, 'Account A is a member');

    await transferBalance(api, alice, aKeyPair.address, membershipFee);
    accountBalance = (await getBalance(aKeyPair.address)).toNumber();
    assert(
      accountBalance >= membershipFee,
      'The account balance is insufficient to purchase membership'
    );

    await buyMembership(api, aKeyPair, 0, 'late_member');
    aMembership = await getMembership(aKeyPair.address);
    assert(!aMembership.isEmpty, 'Account A is a not member');
  }).timeout(60000);

  after(function() {
    api.disconnect();
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
      await Utils.getNonce(account, api),
      expectFailure
    );
  }

  async function getMembership(address: string) {
    return api.query.members.memberIdsByControllerAccountId(address);
  }

  async function getBalance(address: string): Promise<Balance> {
    return api.query.balances.freeBalance<Balance>(address);
  }

  async function transferBalance(
    api: ApiPromise,
    from: KeyringPair,
    to: string,
    amount: number,
    nonce: BN = new BN(-1)
  ) {
    let _nonce = nonce.isNeg() ? await Utils.getNonce(from, api) : nonce;
    return Utils.signAndSend(
      api.tx.balances.transfer(to, amount),
      from,
      _nonce
    );
  }
});
