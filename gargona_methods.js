let methods = {
    'wex': {
        book_init: (data, pair) => {
            return new Promise((resolve, reject) => {
                // if (_.has(book, pair)) {
                let book = []
                let seq = 0

                //asks
                _.each(data.asks, (ask) => {
                    book.push([
                        +ask[0],
                        +ask[1] > 0 ? 1 : 0,
                        -ask[1]
                    ]);
                })

                //bids
                _.each(data.bids, (bid) => {
                    book.push([
                        +bid[0],
                        +bid[1] > 0 ? 1 : 0,
                        +bid[1]
                    ]);
                })
                // console.log(book)

                resolve(book, seq)
                // }
                // reject()
            })
        },
    },
    'poloniex': {
        book_init: (data, pair) => {
            return new Promise((resolve, reject) => {
                // {"asks":[[0.00007600,1164],[0.00007620,1300], ... ], "bids":[[0.00006901,200],[0.00006900,408], ... ],
                // "isFrozen": 0, "seq": 18849}

                let book = []
                let seq = 0 //data.seq

                //asks
                _.each(data.asks, (ask) => {
                    book.push([
                        ask[0],
                        ask[1] > 0 ? 1 : 0,
                        -ask[1]
                    ]);
                })

                //bids
                _.each(data.bids, (bid) => {
                    book.push([
                        bid[0],
                        bid[1] > 0 ? 1 : 0,
                        +bid[1]
                    ]);
                })
                // console.log(data)
                resolve(book, seq)
                // reject()
            })
        },
    },

    'bitstamp': {
        book_init: (data, pair) => {
            return new Promise((resolve, reject) => {
                let book = []
                let seq = 0
                //asks
                _.each(data.asks, (ask) => {
                    book.push([
                        +ask[0],
                        1,
                        -ask[1]
                    ]);
                })
                //bids
                _.each(data.bids, (bid) => {
                    book.push([
                        +bid[0],
                        1,
                        +bid[1]
                    ]);
                })
                // console.log(data)
                resolve(book, seq)
            })
        },
    },
    'bittrex': {
        book_init: (data, pair) => {
            return new Promise((resolve, reject) => {
                // if (_.has(book, pair)) {
                // let data = book[pair]
                // console.log(data)
                let book = []
                let seq = 0

                //asks
                _.each(data.sell, (ask) => {
                    book.push([
                        +ask.Rate,
                        1,
                        -ask.Quantity
                    ]);
                })

                //bids
                _.each(data.buy, (bid) => {
                    book.push([
                        +bid.Rate,
                        1,
                        +bid.Quantity
                    ]);
                })
                // console.log(data)
                resolve(book, seq)
                // }
                // reject()
            })
        },
    },
    'bitfinex': {
        book_init: (data, pair) => {
            return new Promise((resolve, reject) => {
                let book = []
                let seq = 0

                _.each(data, (order) => {
                    book.push([
                        order[0],
                        order[1],
                        order[2]
                    ]);
                })

                // console.log(book)
                resolve(book, seq)
            })
        },
    },
};

module.exports = methods;

// export default markets
