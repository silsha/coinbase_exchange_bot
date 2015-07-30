#!/usr/bin/env node

var OrderBook = require('./order_book/order_book');
var TradeManager = require('./trade_manager/trade_manager');
var socketIO = require('socket.io');
var config = require('../config.json');

module.exports = function() {
  var orderBook = new OrderBook();
  var tradeManager = new TradeManager(config);

  // setup socket server
  var io = socketIO.listen(8888);
  var socket = null;
  io.on('connection', function(s) {
    socket = s;
  });

  function socketEmit(name, data) {
    if (socket) {
      socket.emit(name, data);
    }
  }

  tradeManager.init(function() {
    var tickId = null;
    var updates_initialized = false;

    orderBook.on('update', function(moving_averages) {
      updates_initialized = true;
      console.log('Updated moving averages available.');
    });

    // NOTES:
    // when placing a buy or sell order, we want to cancel match stream
    // and cancel next tick, so no actions can occur while waiting for 
    // order submission
    function stopProcess() {
      clearInterval(tickId);
    }

    // EVENT INIT
    function startProcess() {
      // we only want to take actions at some minimum interval
      tickId = setInterval(nextTick, 1000);
    }

    function logStatus() {
      var last_sell_price = null;
      var last_buy_price = null;

      if (orderBook.hasLastSellPrice()) {
        last_sell_price = orderBook.getLastSellPrice();
      }

      if (orderBook.hasLastBuyPrice()) {
        last_buy_price = orderBook.getLastBuyPrice();
      }

      console.log('LAST BUY: ' + last_buy_price + ' --- ' + 'LAST SELL: ' + last_sell_price);
    }

    function nextTick() {
      if (updates_initialized) {
        logStatus();

        socketEmit('status', {
          last_sell_price: orderBook.hasLastSellPrice() ? orderBook.getLastSellPrice() : null,
          last_buy_price: orderBook.hasLastBuyPrice() ? orderBook.getLastBuyPrice() : null,
          bearish: trend.isBearish(),
          bullish: trend.isBullish()
        });
      }
    }

    tradeManager.on('buy:settled', function(order_data) {
      startProcess();
      tradeManager.getTradeHistoryStats(function(stats) {
        // console.log('TOTAL BUY VAL: ' + stats.daily_stats.total_buy_value + ' --- TOTAL SELL VAL: ' + stats.daily_stats.total_sell_value);
        socketEmit('buy:settled', { 
          order_data: order_data,
          stats: stats
        });
      });
    });

    tradeManager.on('sell:settled', function(order_data) {
      startProcess();
      tradeManager.getTradeHistoryStats(function(stats) {
        console.log('TOTAL BUY VAL: ' + stats.daily_stats.total_buy_value + ' --- TOTAL SELL VAL: ' + stats.daily_stats.total_sell_value);
        socketEmit('sell:settled', { 
          order_data: order_data,
          stats: stats
        });
      });
    });

    tradeManager.on('buy:cancelled', function(order_data) {
      startProcess();
      socketEmit('buy:cancelled', order_data);
    });

    tradeManager.on('sell:cancelled', function(order_data) {
      startProcess();
      socketEmit('sell:cancelled', order_data);
    });

    // kick start the trader in 60 seconds to allow the order book time to get started
    setTimeout(function() {
      startProcess();
    }, 60000);
  });
};
