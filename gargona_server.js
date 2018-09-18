'use strict';
// const express = require('express');
// const https = require('https');
// const fs = require('fs');
const _ = require('lodash');
const redis = require('redis')
let redis_pub = redis.createClient();
// let redis_sub = redis.createClient();
// const WebSocket = require('ws');
// const url = require('url');

console.log('gargona server');
// require('dotenv').config()
// console.log(process.env);
let markets = require('./gargona_markets.json');
let methods = require('./gargona_methods.js');
// let config = require('./gargona_config.js');
const depth = '25';
const Pusher = require('pusher-js');
const BFX = require('bitfinex-api-node');
const PLNX = require('poloniex-api-node');
const BTRX = require('node-bittrex-api');

/*
//server
const server = https.createServer(
    {
        cert: fs.readFileSync(config.sslCertPath),
        key: fs.readFileSync(config.sslKeyPath),
        // ca: '',
        // passphrase: ''
    }, (req, res) => {
        res.writeHead(403);
        res.end('forbidden\n');
    }
);
const wss = new WebSocket.Server({
    verifyClient: (info, done) => {
        console.log('verify:',info.req.headers['sec-websocket-key']);
        done(true);
        // console.log('Parsing session from request...');
        // sessionParser(info.req, {}, () => {
        //     console.log('Session is parsed!');
        //
        //     //
        //     // We can reject the connection by returning false to done(). For example,
        //     // reject here if user is unknown.
        //     //
        //     // done(info.req.session.userId);
        //     done(info.req.session.userId);
        // })
    },
    server
});

function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', function connection(ws, req) {
    // const location = url.parse(req.url, true);
    // console.log(req.headers['sec-websocket-key']);
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)

    ws.isAlive = true;
    ws.on('pong', heartbeat);
    ws.on('message', (msg) => {
        // ws.send(msg);
        console.log(msg);
    });
    // send some message
    // ws.send('hello\n');
    ws.on('close', function () {
        // delete clients[ws.upgradeReq.headers['sec-websocket-key']];
    });
    ws.on('error', function(e) {
        console.log(e)
        // forgetSocket(socket)
    })
});

const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();

        ws.isAlive = false;
        ws.ping('', false, true);
        // console.log('ping');
    });
}, 30000);

server.listen(config.port, function listener() {
    console.log(server.address());
});

function sendToClient(data) {

}
*/
function publishOrderbookEvent(market, pair, book, seq) {
    // console.log('publish:', pair, book)
    // seq = seq || _.now()
    // redis_pub.publish("private-trader",
    //     JSON.stringify({
    //         "event": "App\\Events\\OrderBook",
    //         "data": {
    //             // time: Math.floor(_.now() / 1000),
    //             seq: seq,
    //             market: market,
    //             pair: pair,
    //             book: book
    //         }
    //     }));
    publishOrderEvent(market, pair, book)
}

function publishAskEvent(market, pair, price) {
    console.log('publish ask:', market, pair, price)
    redis_pub.publish("private-trader",
        JSON.stringify({
            "event": "App\\Events\\Ask",
            "data": {
                market: market,
                pair: pair,
                price: price
            }
        }));
}

function publishBidEvent(market, pair, price) {
    console.log('publish bid:', market, pair, price)
    redis_pub.publish("private-trader",
        JSON.stringify({
            "event": "App\\Events\\Bid",
            "data": {
                market: market,
                pair: pair,
                price: price
            }
        }));
}



function publishTickerEvent(market, pair, ticker) {
    redis_pub.publish("private-trader",
        JSON.stringify({
            "event": "App\\Events\\Ticker",
            "data": {
                time: _.now(),
                market: market,
                pair: pair,
                ticker: ticker
            }
        }));
}

// redis_sub.on("subscribe", function (channel, count) {
//     //
// });
// redis_sub.on("message", function(channel, message) {
//     console.log('client message:',message);
// });
// redis_sub.subscribe("private-trader");
let orderbook = {}
function initMarkets() {
    _.forEach(markets, (market, market_name) => {
        if (market.active) {
            console.log('init ' + market_name)
            _.forEach(market.pairs, (pair, pair_name) => {
                pair.asks = [{price:0, amount:0}];
                pair.bids = [{price:0, amount:0}];
                pair.ask = 0;
                pair.bid = 0;
                // console.log('init ' , markets[market_name].pairs[pair_name].asks)
            })
        }
    });

}

function publishOrderEvent(market, pair, book) {
    if (markets[market].active && _.has(markets[market].pairs, pair)) {
        //do logic
        /*
        when count > 0 then you have to add or update the price level
        3.1 if amount > 0 then add/update bids
        3.2 if amount < 0 then add/update asks
        when count = 0 then you have to delete the price level.
        4.1 if amount = 1 then remove from bids
        4.2 if amount = -1 then remove from asks
        */
        let pp = {price: +book[0], cnt: +book[1], amount: +book[2]}

        let side = pp.amount >= 0 ? 'bids' : 'asks'

        let idx = markets[market].pairs[pair][side].findIndex(e => e.price == pp.price)
        if (!pp.cnt) {
//                    this.$delete(this.markets[market].pairs[alias][side], pp.price)
            if (idx !== -1) {
                markets[market].pairs[pair][side].splice(idx, 1);
//                        console.log('del', market, alias, side, idx, pp);
//                    } else {
//                        console.log('del failed', market, alias, side, idx, pp);
            }
        } else {
            if (idx !== -1) {
                //replace/update
                markets[market].pairs[pair][side].splice(idx, 1, {price: pp.price, amount: Math.abs(pp.amount)});
//                        console.log('upd', market, alias, side, idx, pp);
            } else {
                //insert
                if (pp.amount >= 0) { //bids
                    //ищем первую цену меньше новой
                    // это позволит держать массивы отсортироваными по убыванию
                    idx = markets[market].pairs[pair][side].findIndex(e => e.price < pp.price)
//                            console.log('add bid', market, alias, side, idx, pp);
                } else { //asks
                    //ищем первую цену больше новой
                    // это позволит держать массивы отсортироваными по возрастанию
                    idx = markets[market].pairs[pair][side].findIndex(e => e.price > pp.price)
//                            console.log('add ask', market, alias, side, idx, pp);
                }
                idx = idx !== -1 ? idx : markets[market].pairs[pair][side].length
                markets[market].pairs[pair][side].splice(idx, 0, {price: pp.price, amount: Math.abs(pp.amount)});
            }

            //проверка на корректность обновления и на залипшие сделки
            // если спред отрицательный, значит делаем вывод, что один из крайних ордеров залип
            // если спред стал отрицательным в момент обработки "bid", значит просто удаляем ордер ask
            // и наоборот.

//                    if (this.markets[market].pairs[alias].asks.length && this.markets[market].pairs[alias].bids.length &&
//                        this.markets[market].pairs[alias].asks[0].price - this.markets[market].pairs[alias].bids[0].price <= 0 ) {
//                        if (pp.amount >= 0) { //bids
//                            this.markets[market].pairs[alias].asks.splice(0, 1);
//                        } else {
//                            this.markets[market].pairs[alias].bids.splice(0, 1);
//                        }
//                    }

            //truncate depth to limit
            if (markets[market].pairs[pair][side].length > depth) {
//                        console.log('trunc', market, alias, side, this.depth);
                markets[market].pairs[pair][side].splice(depth)
            }


        }
        if (markets[market].pairs[pair].ask !== markets[market].pairs[pair].asks[0].price) {
            markets[market].pairs[pair].ask = markets[market].pairs[pair].asks[0].price
            publishAskEvent(market, pair, markets[market].pairs[pair].ask)
        }
        if (markets[market].pairs[pair].bid !== markets[market].pairs[pair].bids[0].price) {
            markets[market].pairs[pair].bid = markets[market].pairs[pair].bids[0].price
            publishBidEvent(market, pair, markets[market].pairs[pair].bid)
        }

    }
}
initMarkets()
// console.log(markets)
Object.keys(markets).forEach(market => {
    // console.log(market)
    if (markets[market].active) {
        console.log('Connecting:', market);
        switch (market) {
            case 'wex':
                let wex = new Pusher(markets[market].APP_KEY, {
                    cluster: 'eu'
                });
                let wex_channels = [];
                _.forEach(markets[market].pairs, (pair, pair_name) => {

                    // Object.keys(markets[market].pairs).forEach(pair => {
                    console.log('wex pair subscribe', pair_name);
                    let channel = wex.subscribe(pair_name + '.depth');

                    channel.bind('depth', function (data) {
                        // console.log('wex: ', this.pair, data);

                        //asks
                        _.forEach(data.ask, (ask) => {
                            let book = [
                                ask[0],
                                ask[1] > 0 ? 1 : 0,
                                ask[1] > 0 ? -ask[1] : 1
                            ];
                            publishOrderbookEvent('wex', this.pair, book)
                        });

                        //bids
                        _.forEach(data.bid, (bid) => {
                            let book = [
                                bid[0],
                                bid[1] > 0 ? 1 : 0,
                                bid[1] > 0 ? +bid[1] : 1
                            ];
                            publishOrderbookEvent('wex', this.pair, book)
                        })


                    }, {pair: pair_name});
                    wex_channels.push(channel)
                });

                // wex.bind('depth', function(data) {
                //     console.log('wex: ',data);
                // });
                break;

            case 'bitstamp':
                let bts = new Pusher(markets[market].APP_KEY, {
                    cluster: 'mt1'
                });
                let bts_channels = [];
                _.forEach(markets[market].pairs, (pair, pair_name) => {

                    // Object.keys(markets[market].pairs).forEach(pair => {
                    console.log('bitstamp pair subscribe', pair_name);
                    let channel = bts.subscribe('live_orders_' + pair_name);

                    channel.bind('order_created', function (data) {
                        // id	Order ID.
                        //     amount	Order amount.
                        //     price	Order price.
                        //     order_type	Order type (0 - buy; 1 - sell).
                        // datetime	Order datetime.
                        let book = [
                            data.price,
                            1,
                            (data.order_type > 0 ? -1 : 1) * data.amount
                        ];
                        // console.log('bitstamp order_created', book);
                        publishOrderbookEvent('bitstamp', this.pair, book)
                    }, {pair: pair_name});

                    channel.bind('order_changed', function (data) {
                        let book = [
                            data.price,
                            1,
                            (data.order_type > 0 ? -1 : 1) * data.amount
                        ];
                        // console.log('bitstamp order_changed', book);
                        publishOrderbookEvent('bitstamp', this.pair, book)
                    }, {pair: pair_name});
                    channel.bind('order_deleted', function (data) {
                        let book = [
                            data.price,
                            0,
                            data.order_type > 0 ? -1 : 1
                        ];
                        // console.log('bitstamp order_deleted', book);
                        publishOrderbookEvent('bitstamp', this.pair, book)
                    }, {pair: pair_name});
                    bts_channels.push(channel)
                });

                // wex.bind('depth', function(data) {
                //     console.log('wex: ',data);
                // });
                break;
            case 'poloniex':
                const plx_opts = {
                    version: 2,
                    transform: false
                };


                let plx = new PLNX(markets['poloniex'].API_KEY, markets['poloniex'].API_SECRET);

                plx.on('open', () => {

                    // if (markets['poloniex'].ticker) {
                    //     console.log('poloniex ticker subscribe');
                    //     plx.subscribe('ticker')
                    // } else {
                        _.forEach(markets['poloniex'].pairs, (pair, pair_name) => {
                            // Object.keys(markets[market].pairs).forEach(pair => {
                            console.log('poloniex pair subscribe', pair_name);
                            plx.subscribe(pair_name)
                        })
                    // }
                });

                plx.on('message', (channelName, data, seq) => {
                    //преобразуем в нужный формат
                    // if (markets['poloniex'].ticker) {
                    //     if (channelName === 'ticker') {
                    //         if (_.has(markets['poloniex'].pairs, data.currencyPair)) {
                    //             let ticker = {
                    //                 bid: data.highestBid,
                    //                 ask: data.lowestAsk,
                    //             }
                    //             // console.log('Ticker Update for ' + marketsDelta.MarketName, marketsDelta);
                    //             publishTickerEvent('poloniex', data.currencyPair, ticker)
                    //         }
                    //         // console.log('Ticker: ',data);
                    //     }
                    // } else {
                        if (_.has(markets[market].pairs, channelName)) {
                            // let pair = channelName
                            _.forEach(data, (obj) => {
                                let book = []
                                switch (obj.type) {
                                    case 'orderBookModify':
                                        book = [
                                            obj.data.rate,
                                            1,
                                            (obj.data.type === 'bid' ? 1 : -1) * obj.data.amount
                                        ];
                                        // console.log('order remove', channelName, book);
                                        publishOrderbookEvent('poloniex', channelName, book);
                                        break;
                                    case 'orderBookRemove':
                                        book = [
                                            obj.data.rate,
                                            0,
                                            (obj.data.type === 'bid' ? 1 : -1)
                                        ];
                                        // console.log('order upd', channelName, book);
                                        publishOrderbookEvent('poloniex', channelName, book);
                                        break;
                                    default:
                                }
                            })

                            // console.log(`data sequence number is ${seq}`);
                        }
                    // }

                    // if (channelName === 'BTC_ETC') {
                    //     console.log(`order book and trade updates received for currency pair ${channelName}`);
                    //     console.log(`data sequence number is ${seq}`);
                    // }
                });

                plx.on('error', console.error);
                plx.openWebSocket({version: 2});
                break;
            case 'bitfinex':
                const bfx_opts = {
                    version: 2,
                    transform: false,
                    ws: {
                        autoReconnect: true,
                        seqAudit: true,
                        // packetWDDelay: 10 * 1000
                    }
                };
                const bfx = new BFX(markets[market].API_KEY, markets[market].API_SECRET, bfx_opts);
                let bfxws = bfx.ws

                bfxws.on('auth', () => {
                    // emitted after .auth()
                    // needed for private api endpoints
                    console.log('authenticated')
                    // bws.submitOrder ...
                });

                bfxws.on('open', () => {
                    // if (markets['bitfinex'].ticker) {
                    //     _.forEach(markets[market].pairs, (pair, pair_name) => {
                    //         console.log('bitfinex ticker subscribe', pair_name);
                    //         bfxws.subscribeTicker(pair_name)
                    //     })
                    // } else {
                        _.forEach(markets[market].pairs, (pair, pair_name) => {
                            // Object.keys(markets[market].pairs).forEach(pair => {
                            console.log('bitfinex pair subscribe', pair_name);
                            bfxws.subscribeOrderBook(pair_name, 'P0', '25')

                        })
                    // }
                    // authenticate
                    // bws.auth()
                });

                bfxws.on('orderbook', (pair, book) => {
                    //преобразуем в нужный формат
                    // if (pair.charAt(0) === 't') {
                    //     pair = pair.substr(1);
                    // }
                    if (!Array.isArray(book[0])) {
                        // console.log('orderbook:', pair, book)
                        publishOrderbookEvent('bitfinex', pair, book)
                    }
                });

                // bfx.on('trade', (pair, trade) => {
                //     console.log('Trade:', trade)
                // })
                //
                // bfxws.on('ticker', (pair, data) => {
                //     // console.log('Ticker:', ticker)
                //     if (_.has(markets['bitfinex'].pairs, pair)) {
                //         let ticker = {
                //             //     bid: data.highestBid,
                //             //     ask: data.lowestAsk,
                //         }
                //         console.log('Ticker:', pair, data)
                //         // publishTickerEvent('poloniex', pair, ticker)
                //     }
                // })

                // bfx.on('error', console.error);
                bfxws.on('close', (e) => {
                    console.log('BFX Socket is closed. Reconnecting...', e);
                    // setTimeout(function() {
                    //     bfx_connect(key, secret, bfx_opts);
                    // }, 100);
                });
                bfxws.on('error', (e) => {
                    console.error('BFX Socket encountered error: ', e);
                });
                break;
            case 'bittrex':
                const btrx_opts = {
                    'apikey': markets[market].API_KEY,
                    'apisecret': markets[market].API_SECRET,
                    // 'verbose': true,
                    // 'cleartext': false,

                    websockets: {
                        onConnect: function () {
                            // console.log('BTRX Websocket connected');
                            // console.log('bittrex ticker subscribe');
                            // BTRX.websockets.listen(function(data, client) {
                            //     if (data.M === 'updateSummaryState') {
                            //         data.A.forEach(function(data_for) {
                            //             data_for.Deltas.forEach(function(marketsDelta) {
                            //                 if (_.has(markets['bittrex'].pairs, marketsDelta.MarketName)) {
                            //                     let ticker = {
                            //                             bid: marketsDelta.Bid,
                            //                             ask: marketsDelta.Ask,
                            //                         }
                            //                     // console.log('Ticker Update for ' + marketsDelta.MarketName, marketsDelta);
                            //                     publishTickerEvent('bittrex', marketsDelta.MarketName, ticker)
                            //                 }
                            //             });
                            //         });
                            //     }
                            //     // console.log('Ticker Update for ' + marketsDelta.MarketName, ticker);
                            // });

                            let pair_names = [];
                            _.forEach(markets[market].pairs, (pair, pair_name) => {
                                pair_names.push(pair_name);
                            });

                            //
                            console.log('bittrex pair subscribe', pair_names);
                            BTRX.websockets.subscribe(pair_names, function (data) {
                                if (data.M === 'updateExchangeState') {
                                    data.A.forEach(function (data_for) {
                                        // console.log('Market Update for ' + data_for.MarketName);
                                        // console.log('bids ', data_for.Buys,);
                                        // console.log('asks ', data_for.Sells);
                                        //asks
                                        _.forEach(data_for.Sells, (ask) => {
                                            // when count > 0 then you have to add or update the price level
                                            // 3.1 if amount > 0 then add/update bids
                                            // 3.2 if amount < 0 then add/update asks
                                            // when count = 0 then you have to delete the price level.
                                            // 4.1 if amount = 1 then remove from bids
                                            // 4.2 if amount = -1 then remove from asks
                                            // Type 0 – you need to add this entry into your orderbook. There were no orders at matching price before.
                                            // Type 1 – you need to delete this entry from your orderbook. This entry no longer exists (no orders at matching price)
                                            // Type 2 – you need to edit this entry. There are different number of orders at this price.
                                            // Buys, Sells are bids / asks, and Fills are trades.
                                            let book = [
                                                +ask.Rate, //price
                                                ask.Type === 1 ? 0 : 1, //count
                                                ask.Type === 1 ? -1 : -ask.Quantity //amount
                                            ];
                                            publishOrderbookEvent('bittrex', data_for.MarketName, book)
                                            // console.log('order ask', data_for.MarketName, book);
                                        });

                                        //bids
                                        _.forEach(data_for.Buys, (bid) => {
                                            let book = [
                                                +bid.Rate, //price
                                                bid.Type === 1 ? 0 : 1, //count
                                                bid.Type === 1 ? 1 : +bid.Quantity //amount
                                            ];
                                            publishOrderbookEvent('bittrex', data_for.MarketName, book)
                                            // console.log('order bid', data_for.MarketName, book);
                                        })
                                    });
                                    // } else {
                                    //     console.log('btrx event: ', data)
                                }
                            });

                        },
                        onDisconnect: function () {
                            console.log('BTRX Websocket disconnected');
                        }
                    }
                };

                BTRX.options(btrx_opts);
                //
                // BTRX.websockets.client(function() {
                //     console.log('BTRX Websocket connected');
                //     BTRX.websockets.subscribe(['BTC-ETH'], function(data) {
                //         if (data.M === 'updateExchangeState') {
                //             data.A.forEach(function(data_for) {
                //                 console.log('Market Update for '+ data_for.MarketName, data_for);
                //             });
                //         }
                //     });
                // });
                //
                //
                let btx;
                BTRX.websockets.client(function (client) {
                    btx = client;
                });


                break;
            default:
        }
//         markets[market].instance = new autobahn.Connection({
//             url: markets[market].url,
//             realm: "realm1",
//             lazy_open: true,
//             debug: true,
//         });
//         markets[market].instance.onopen = function (session) {
//
//
// //                                    Object.keys(_this.markets[market].pairs).forEach(pair => {
// //                                        console.log('pair subs',_this.markets[market].pairs[pair].alias)
// //                                        session.subscribe(_this.markets[market].pairs[pair].alias, marketEvent)
// //                                    })
//
//             session.subscribe('ticker', tickerEvent)
// //                                    session.subscribe('trollbox', trollboxEvent)
//         }
//
//         _this.markets[market].instance.onclose = function () {
//             console.log(market, "connection closed")
//         }
//         _this.markets[market].instance.open()
    }
});


// const w = new WebSocket('wss://api.bitfinex.com/ws/2');
// w.on('message', (msg) => console.log(msg));
//
// let msg = JSON.stringify({
//     event: 'subscribe',
//     channel: 'ticker',
//     symbol: 'tBTCUSD'
// });
//
// w.on('open', () => w.send(msg));


// const p = new Pusher(APP_KEY, {
//     cluster: APP_CLUSTER,
// });


