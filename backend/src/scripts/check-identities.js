// Copyright Parity Technologies (UK) Ltd., 2017.
// Released under the Apache 2/MIT licenses.

'use strict';

const path = require('path');

process.env.NODE_CONFIG_DIR = path.resolve(__dirname, '../../../config');

const store = require('../store');
const Onfido = require('../onfido');

const documentMap = {};

const config = require('config');
const { RpcTransport } = require('../api/transport');
const ParityConnector = require('../api/parity');

const transport = new RpcTransport(config.get('nodeWs'));
const connector = new ParityConnector(transport);

async function addDocuments (identity) {
  const checks = await identity.checks.getAll();

  for (const check of checks) {
    const { documentHash } = check;

    if (!documentHash) {
      continue;
    }

    if (!documentMap[documentHash]) {
      documentMap[documentHash] = [];
    }

    documentMap[documentHash].push(identity.address);
  }
}

async function push (verification, href) {
  const { address } = verification;
  const hasPendingTransaction = await store.hasPendingTransaction(address);

  if (hasPendingTransaction) {
    const txHash = await store.getPendingTransaction(address);
    const receipt = await connector.getTxReceipt(txHash);

    if (!receipt) {
      console.warn(`> Transaction ${txHash} is not to be found. Deleting it.`);
      await store.removePendingTransaction(address);
    } else {
      console.warn(`> Pending transaction:`, receipt);
    }
  } else {
    console.warn(`> No pending transaction for ${address}`);
  }

  store.push(href);
}

async function checkIdentity (identity) {
  const check = await identity.getData();
  const { status } = check;

  if (status === 'pending') {
    const applicants = await identity.applicants.getAll();
    const applicant = applicants.find((a) => a.checkId === check.id);
    const href = `https://api.onfido.com/v2/applicants/${applicant.id}/checks/${check.id}`;
    const verification = await Onfido.verify(href);
    const { address } = verification;

    // Verification still pending. Skip.
    if (verification.pending) {
      return;
    }

    if (!verification.documentHash) {
      return console.warn(`\n> ${address} : no document hash`, verification);
    }

    if (verification.reason === 'used-document') {
      if (!documentMap[verification.documentHash]) {
        console.warn(`\n> ${address} should not be set as used document. Removing it.`);
        store.markDocumentAsUnused(verification.documentHash);
        await push(verification, href);
      }

      return;
    }

    console.warn(`\n> ${address} should be tested again. Pushing it.`);
    await push(verification, href);
  }
}

async function main () {
  let count = 0;
  let total = 0;

  try {
    await store.scanIdentities(async (identity) => {
      total++;
      await addDocuments(identity);
    });

    await store.scanIdentities(async (identity) => {
      count++;
      await checkIdentity(identity);
      process.stderr.write(`\r${Math.round(10000 * count / total) / 100} %           `);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  console.warn('\nDone');
  process.exit(0);
}

main();
