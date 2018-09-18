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
// let methods = require('./gargona_methods.js');
// let config = require('./gargona_config.js');
const depth = '25';
const Pusher = require('pusher-js');
const BFX = require('bitfinex-api-node');
const PLNX = require('poloniex-api-node');
const BTRX = require('node-bittrex-api');

function publishOrderBookEvent(market, pair, book) {
    // console.log('publish:', pair, book)
    redis_pub.publish("private-trader",
        JSON.stringify({
            "event": "App\\Events\\OrderBook",
            "data": {
                market: market,
                pair: pair,
                book: book
            }
        }));
}

function publishAskBidEvent(market, pair, {ask, bid, pulse}, {isAsk, isBid}) {
    // console.log('publish ask-bid:', market, pair, {ask, bid, pulse}, {isAsk, isBid})
    redis_pub.publish("private-trader",
        JSON.stringify({
            "event": "App\\Events\\AskBid",
            "data": {
                market,
                pair,
                ask,
                bid,
                // pulse,
                isAsk,
                isBid
            }
        }));
}


function publishPulseEvent(market, pair, pulse) {
    // console.log('publish pulse:', market, pair, pulse)
    redis_pub.publish("private-trader",
        JSON.stringify({
            "event": "App\\Events\\Pulse",
            "data": {
                market,
                pair,
                pulse,
            }
        }));
}

const baseAvg = 0.5
const attTicks = 600 //10min
const avgDepth = 30
// const timeDevider = 1

function Book(market_name, pair_name) {
    // let self = this;
    // this.baseBeats = 0.5
    // this.attTicks = 600 //10min
    // this.avgDepth = 10
    this.depth = 5;
    this.asks = [];
    this.bids = [];
    this.Order = function ({price, cnt, amount}) {
        //do logic
        /*
        when count > 0 then you have to add or update the price level
        3.1 if amount > 0 then add/update bids
        3.2 if amount < 0 then add/update asks
        when count = 0 then you have to delete the price level.
        4.1 if amount = 1 then remove from bids
        4.2 if amount = -1 then remove from asks
        */
        let side = amount >= 0 ? 'bids' : 'asks'
        let idx = this[side].findIndex(e => e.price === price)
        if (!cnt) {
            //del
            if (idx !== -1) { this[side].splice(idx, 1);}
        } else {
            if (idx !== -1) {
                //replace/update
                this[side].splice(idx, 1, {price: price, amount: Math.abs(amount)});
            } else {
                //insert
                if (amount >= 0) { //bids
                    //ищем первую цену меньше новой
                    // это позволит держать массивы отсортироваными по убыванию
                    idx = this[side].findIndex(e => e.price < price)
                } else { //asks
                    //ищем первую цену больше новой
                    // это позволит держать массивы отсортироваными по возрастанию
                    idx = this[side].findIndex(e => e.price > price)
                }
                idx = idx !== -1 ? idx : this[side].length
                this[side].splice(idx, 0, {price: price, amount: Math.abs(amount)});
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
            if (this[side].length > depth) {
                this[side].splice(depth)
            }
        }
    }.bind(this);
    // this.interval = setInterval(function () {
    //     let book = {
    //         asks: this.asks.slice(0, this.depth),
    //         bids: this.bids.slice(0, -this.depth).reverse()
    //     }
    //     console.log('publish book ' , market_name, pair_name, book)
    //     publishOrderBookEvent(market_name, pair_name, book)
    // }.bind(this), 500);
}
function Pulse(market_name, pair_name) {
    // let self = this;
    // this.baseBeats = 0.5
    // this.attTicks = 600 //10min
    // this.avgDepth = 10
    // this.
    this.rate = 0;
    this.askRate = 0;
    this.bidRate = 0;
    this.beats = {ask: [], bid: []};
    this.askBeats = 0;
    this.bidBeats = 0;
    // this.prevBeats = 0;

    // this.lowTicks = 0
    this.lowAskTicks = attTicks * 3
    this.lowBidTicks = attTicks * 3
    this.Beat = function ({isAsk, isBid}) {
        this.askBeats += isAsk ? 1 : 0
        this.bidBeats += isBid ? 1 : 0
    }.bind(this);
    this.interval = setInterval(function () {
        this.beats.bid.push(this.bidBeats)
        this.beats.ask.push(this.askBeats)
        if (this.beats.bid.length > avgDepth) {
            this.beats.bid.shift()
        }
        if (this.beats.ask.length > avgDepth) {
            this.beats.ask.shift()
        }
        let bidAvg = _.chain(this.beats.bid).sum().divide(this.beats.bid.length)
        let askAvg = _.chain(this.beats.ask).sum().divide(this.beats.ask.length)
        if (bidAvg > baseAvg) {
            // this.bidRate = 1
            this.lowBidTicks = 0
        } else {
            this.lowBidTicks++
        }
        if (askAvg > baseAvg) {
            // this.askRate = 1
            this.lowAskTicks = 0
        } else {
            this.lowAskTicks++
        }
        this.bidRate = Math.pow(Math.E, -this.lowBidTicks * (1 - bidAvg / (baseAvg + bidAvg)) / attTicks)
        this.askRate = Math.pow(Math.E, -this.lowAskTicks * (1 - askAvg / (baseAvg + askAvg)) / attTicks)
        // return
        // if (this.bidBeats + this.askBeats) {
        //     this.rate = 1
        //     this.lowTicks = 0
        // } else {
        //     this.lowTicks++
        //     this.rate = Math.round(Math.pow(this.baseBeats, -this.lowTicks*(1-this.curBeats/this.baseBeats)/this.attTicks) * 100) / 100
        // this.curBeats / this.baseBeats
        // }

        this.rate = this.askRate * this.bidRate * (1 - (Math.abs(this.askRate - this.bidRate) / (this.askRate + this.bidRate)))

        // if (this.rate === 0) {
        //
        // }

        publishPulseEvent(market_name, pair_name, {
            rate: Math.round(this.rate * 100) / 100,
            askRate: Math.round(this.askRate * 100) / 100,
            bidRate: Math.round(this.bidRate * 100) / 100,
            // askBeats: this.askBeats,
            // bidBeats: this.bidBeats,
            // lowAskTicks: this.lowAskTicks,
            // lowBidTicks: this.lowBidTicks,
            // askAvg,
            // bidAvg,
            // beats: this.beats
        })

        this.bidBeats = 0
        this.askBeats = 0
    }.bind(this), 1000);


}

function initMarkets() {
    _.forEach(markets, (market, market_name) => {
        if (market.active) {
            console.log('init ' + market_name)
            _.forEach(market.pairs, (pair, pair_name) => {
                pair.asks = [];
                pair.bids = []; //{price:0, amount:0}
                pair.ask = 0;
                pair.bid = 0;
                pair.pulse = new Pulse(market_name, pair_name)
                pair.book = new Book(market_name, pair_name)
                // console.log('init ' , markets[market_name].pairs[pair_name].asks)
            })
        }
    });

}

function processOrderEvent(market, pair, book) {
    // console.log('update',market, pair, book)
    //publish raw book event
    publishOrderBookEvent(market, pair, book)
    if (markets[market].active && _.has(markets[market].pairs, pair)) {

        markets[market].pairs[pair].book.Order({price: +book[0], cnt: +book[1], amount: +book[2]})

        // console.log('ask', markets[market].pairs[pair].ask, markets[market].pairs[pair].asks[0].price)
        let newBid = markets[market].pairs[pair].book.bids.length ? markets[market].pairs[pair].book.bids[0].price : markets[market].pairs[pair].bid
        // console.log('bid', markets[market].pairs[pair].bid, markets[market].pairs[pair].bids[0].price)
        let newAsk = markets[market].pairs[pair].book.asks.length ? markets[market].pairs[pair].book.asks[0].price : markets[market].pairs[pair].ask

        let isAsk = markets[market].pairs[pair].ask !== newAsk
        let isBid = markets[market].pairs[pair].bid !== newBid
        if (isAsk || isBid) {
            markets[market].pairs[pair].bid = newBid
            markets[market].pairs[pair].ask = newAsk

            markets[market].pairs[pair].pulse.Beat({isAsk, isBid})

            publishAskBidEvent(market, pair, {
                ask: markets[market].pairs[pair].ask,
                bid: markets[market].pairs[pair].bid,
                pulse: markets[market].pairs[pair].pulse.rate
            }, {isAsk, isBid})
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
                            processOrderEvent('wex', this.pair, book)
                        });

                        //bids
                        _.forEach(data.bid, (bid) => {
                            let book = [
                                bid[0],
                                bid[1] > 0 ? 1 : 0,
                                bid[1] > 0 ? +bid[1] : 1
                            ];
                            processOrderEvent('wex', this.pair, book)
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
                        processOrderEvent('bitstamp', this.pair, book)
                    }, {pair: pair_name});

                    channel.bind('order_changed', function (data) {
                        let book = [
                            data.price,
                            1,
                            (data.order_type > 0 ? -1 : 1) * data.amount
                        ];
                        // console.log('bitstamp order_changed', book);
                        processOrderEvent('bitstamp', this.pair, book)
                    }, {pair: pair_name});
                    channel.bind('order_deleted', function (data) {
                        let book = [
                            data.price,
                            0,
                            data.order_type > 0 ? -1 : 1
                        ];
                        // console.log('bitstamp order_deleted', book);
                        processOrderEvent('bitstamp', this.pair, book)
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
                                    processOrderEvent('poloniex', channelName, book);
                                    break;
                                case 'orderBookRemove':
                                    book = [
                                        obj.data.rate,
                                        0,
                                        (obj.data.type === 'bid' ? 1 : -1)
                                    ];
                                    // console.log('order upd', channelName, book);
                                    processOrderEvent('poloniex', channelName, book);
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
                let bfxws = new BFX(markets[market].API_KEY, markets[market].API_SECRET, bfx_opts).ws;

                // let bfxws = bfx_connect(markets[market].API_KEY, markets[market].API_SECRET, bfx_opts);

                // let bfxws = bfx.ws

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
                        processOrderEvent('bitfinex', pair, book)
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
                bfxws.on('close', () => {
                    console.log('BFX Socket is closed. Reconnecting...');

                    setTimeout(function () {
                        // bfx_connect(key, secret, bfx_opts);
                        bfxws.open()
                    }, 100);
                });
                bfxws.on('error', (e) => {
                    console.error('BFX Socket encountered error. Reconnecting... ', e);
                    bfxws.close()
                    // setTimeout(function () {
                    //     // bfx_connect(key, secret, bfx_opts);
                    //     bfxws.open()
                    // }, 100);
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
                                            processOrderEvent('bittrex', data_for.MarketName, book)
                                            // console.log('order ask', data_for.MarketName, book);
                                        });

                                        //bids
                                        _.forEach(data_for.Buys, (bid) => {
                                            let book = [
                                                +bid.Rate, //price
                                                bid.Type === 1 ? 0 : 1, //count
                                                bid.Type === 1 ? 1 : +bid.Quantity //amount
                                            ];
                                            processOrderEvent('bittrex', data_for.MarketName, book)
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

    }
});


