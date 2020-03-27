import { WsProvider } from '@polkadot/api';
import { registerJoystreamTypes } from '@joystream/types';
import { Keyring } from '@polkadot/keyring';
import { assert } from 'chai';
import { KeyringPair } from '@polkadot/keyring/types';
import BN = require('bn.js');
import { ApiMethods } from '../utils/apiMethods';
import { initConfig } from '../utils/config';

describe('Membership integration tests', function() {
  initConfig();
  let apiMethods: ApiMethods;
  const keyring = new Keyring({ type: 'sr25519' });
  let sudo: KeyringPair;
  let nKeyPairs: Array<KeyringPair> = new Array();
  let aKeyPair: KeyringPair;
  const N: number = +process.env.MEMBERSHIP_CREATION_N!;
  let membershipFee: number;

  before(async function() {
    this.timeout(30000);
    registerJoystreamTypes();
    const provider = new WsProvider(process.env.NODE_URL);
    apiMethods = await ApiMethods.create(provider);
    sudo = keyring.addFromUri(process.env.SUDO_ACCOUNT_URL!);
    for (let i = 0; i < N; i++) {
      nKeyPairs.push(keyring.addFromUri(i.toString()));
    }
    aKeyPair = keyring.addFromUri('A');
    membershipFee = await apiMethods.getMembershipFee(0);
    let nonce = await apiMethods.getNonce(sudo);
    nonce = nonce.sub(new BN(1));
    await apiMethods.transferBalanceToAccounts(
      sudo,
      nKeyPairs,
      membershipFee + 1,
      nonce
    );
    await apiMethods.transferBalance(sudo, aKeyPair.address, 2);
  });

  it('Buy membeship is accepted with sufficient funds', async function() {
    await Promise.all(
      nKeyPairs.map(async keyPair => {
        await apiMethods.buyMembership(keyPair, 0, 'new_member');
      })
    );
    nKeyPairs.map(keyPair =>
      apiMethods
        .getMembership(keyPair.address)
        .then(membership =>
          assert(!membership.isEmpty, 'Account m is not a member')
        )
    );
  }).timeout(30000);

  it('Accont A has insufficient funds to buy membership', async function() {
    apiMethods
      .getBalance(aKeyPair.address)
      .then(balance =>
        assert(
          balance.toNumber() < membershipFee,
          'Account A already have sufficient balance to purchase membership'
        )
      );
  }).timeout(30000);

  it('Account A can not buy the membership with insufficient funds', async function() {
    await apiMethods.buyMembership(aKeyPair, 0, 'late_member', true);
    apiMethods
      .getMembership(aKeyPair.address)
      .then(membership => assert(membership.isEmpty, 'Account A is a member'));
  }).timeout(30000);

  it('Account A has been provided with funds to buy the membership', async function() {
    await apiMethods.transferBalance(sudo, aKeyPair.address, membershipFee);
    apiMethods
      .getBalance(aKeyPair.address)
      .then(balance =>
        assert(
          balance.toNumber() >= membershipFee,
          'The account balance is insufficient to purchase membership'
        )
      );
  }).timeout(30000);

  it('Account A was able to buy the membership', async function() {
    await apiMethods.buyMembership(aKeyPair, 0, 'late_member');
    apiMethods
      .getMembership(aKeyPair.address)
      .then(membership =>
        assert(!membership.isEmpty, 'Account A is a not member')
      );
  }).timeout(30000);

  after(function() {
    apiMethods.close();
  });
});
