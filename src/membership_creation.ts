import { ApiPromise, WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { UserInfo, PaidMembershipTerms } from '@joystream/types/lib/members';
import { assert } from 'chai';
import { KeyringPair } from '@polkadot/keyring/types';
import { Utils } from './utils';
import { Option } from '@polkadot/types';
import { Balance } from '@polkadot/types/interfaces';

describe('Membership integration tests', function() {
  let api: ApiPromise;
  const keyring = new Keyring({ type: 'sr25519' });
  let alice: KeyringPair;
  let keyPairs: Array<KeyringPair>;

  before(async function() {
    registerJoystreamTypes();
    const provider = new WsProvider('ws://127.0.0.1:9944');
    api = await ApiPromise.create({ provider });
    alice = keyring.addFromUri('//Alice');
    keyPairs = new Array();
    keyPairs.push(keyring.addFromUri('1'));
  });

  it('Buy membeship is accepted with sufficient funds and rejected with insufficient', async function() {
    let membershipFee = (
      await api.query.members.paidMembershipTermsById<
        Option<PaidMembershipTerms>
      >(0)
    )
      .unwrap()
      .fee.toNumber();
    await transferBalance(api, alice, keyPairs[0].address, 2);
    await buyMembership(api, alice, 0, 'alice_member');
    let aliceMembership = await getMembership(alice.address);
    assert(!aliceMembership.isEmpty, 'Alice is not a member');
    let accountBalance = (await getBalance(keyPairs[0].address)).toNumber();
    assert(
      accountBalance < membershipFee,
      'The account already have sufficient balance to purchase membership'
    );
    await buyMembership(api, keyPairs[0], 0, 'charlie_member', true);
    let charlieMembership = await getMembership(keyPairs[0].address);
    assert(charlieMembership.isEmpty, 'Charlie is a member');
    await transferBalance(api, alice, keyPairs[0].address, membershipFee);
    accountBalance = (await getBalance(keyPairs[0].address)).toNumber();
    assert(
      accountBalance >= membershipFee,
      'The account balance is insufficient to purchase membership'
    );
    await buyMembership(api, keyPairs[0], 0, 'charlie_member');
    charlieMembership = await getMembership(keyPairs[0].address);
    assert(!charlieMembership.isEmpty, 'Charlie is a not member');
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
    amount: number
  ) {
    return Utils.signAndSend(
      api.tx.balances.transfer(to, amount),
      from,
      await Utils.getNonce(from, api)
    );
  }
});
