// Copyright Parity Technologies (UK) Ltd., 2017.
// Released under the Apache 2/MIT licenses.

'use strict';

const config = require('config');
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const etag = require('koa-etag');
const cors = require('kcors');

const { CachingTransport } = require('./api/transport');
const Certifier = require('./contracts/certifier');
const CertifierHandler = require('./contracts/certifierHandler');
const ParityConnector = require('./api/parity');
const Routes = require('./routes');
const Fee = require('./contracts/fee');

const app = new Koa();
const { port, hostname } = config.get('http');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main () {
  const transport = new CachingTransport(config.get('nodeWs'));
  const connector = new ParityConnector(transport);
  const feeRegistrar = new Fee(connector);

  connector.getGasPrice();

  const certifier = new Certifier(connector, config.get('certifierContract'));
  const certifierHandler = new CertifierHandler(connector, certifier);

  app.use(async (ctx, next) => {
    ctx.remoteAddress = ctx.req.headers['x-forwarded-for'] || ctx.req.connection.remoteAddress;

    try {
      await next();
    } catch (err) {
      if (err.status) {
        ctx.status = err.status;
        ctx.body = err.message;
      } else {
        ctx.status = 500;
        ctx.body = 'Internal server error';
      }
      ctx.app.emit('error', err, ctx);
    }
  });

  app
    .use(bodyParser())
    .use(cors())
    .use(etag());

  await Routes(app, { connector, certifier, certifierHandler, feeRegistrar });

  app.listen(port, hostname, () => {
    console.log(`Started server on port ${port}`);
  });
}
