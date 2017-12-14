// Copyright Parity Technologies (UK) Ltd., 2017.
// Released under the Apache 2/MIT licenses.

'use strict';

const Router = require('koa-router');
const config = require('config');

async function get ({ connector, certifier, feeRegistrar }) {
  const router = new Router({
    prefix: '/api'
  });

  const chainId = await connector.netVersion();
  const etherscan = config.get('etherscan');

  router.get('/config', async (ctx, next) => {
    const { gasPrice } = connector;

    ctx.body = {
      etherscan,
      gasPrice: `0x${gasPrice.toString(16)}`,
      chainId
    };
  });

  return router;
}

module.exports = get;
