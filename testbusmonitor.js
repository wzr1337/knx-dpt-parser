/* For Testing only *************************************************************************************
 * 
 * This test program listens to the KNX bus (via knxd) and writes all interpretations of the telegrams
 * to the stdout
 * You need to have all your group addresses in a json file of that format:
 * {
 * 		"1/2/3": {
 *         "type": "DPST-1-1",
 *       	"name": "Kitchen Light"
 *			},
 * 		"1/2/4": {
 *         "type": "DPST-1-1",
 *       	"name": "Dining Light"
 *			}
 * } 
 * 
 * This example requires the eibd package to be installed.
 * 
 */
'use strict';

/*
 * Required configuration for bus access
 */
let config = {
	knxd : {
		host : "knxd2-raspberry.zu.hause",
		port : 6720
	},
	groupaddressfile: 'grouplist.json'
};

let groupaddresses = JSON.parse(require('fs').readFileSync(config.groupaddressfile, 'utf-8'));

var knxd = require('eibd');
var Readable = require('stream').Readable;
var decode = require('./Decoder').decode;


function BusListener(KNXConnection) {

	// what's that doing?
	  Readable.call(this);
	
	  this._source = KNXConnection.socket;
	  this._inputBuffer = new Buffer(0);
	  
	  var self = this;
	  // hit source end
	  this._source.on('end', function() {
	
	  });
	
	  // get data
	  this._source.on('data', function(data) {
//		console.log('data!');
	    self.onBusData(data);
	  });
}

BusListener.prototype = Object.create(
	      Readable.prototype, { constructor: { value: BusListener }});

/**
 * data received from socket
 */
BusListener.prototype.onBusData= function (chunk) {

  // no data received
  if(chunk === null) {
    return ;
  }
    
  // store chunk
  this._inputBuffer = Buffer.concat([this._inputBuffer, chunk]);
    
  while (true) {
    // check if at least length header is here
    if (this._inputBuffer.length < 2) {
      return;
    }

    var packetlen = this._inputBuffer[1] + 2;
    if (packetlen > this._inputBuffer.length) {
      //not enough data
      return;
    }

//    console.log('some data');
    //what kind of packet have we got...
    if (packetlen === 4) {
      //confirm mag
    } else if (packetlen === 5) {
      //opengroupsocket
    } else if (packetlen >= 6) {
      // we have at least one complete package
      var telegram = new Buffer(this._inputBuffer.slice(0, packetlen));
      // emit event
      //this.parseTelegram(telegram);
      
    	  var self = this;
    	  var len = telegram.readUInt8(1);
    	  
    	  // 4 + 5 src adr.
    	  var src = telegram.readUInt16BE(4);
    	  // 6 + 7 dest adr.
    	  var dest = telegram.readUInt16BE(6);

    	  // action
    	  var action = telegram.readUInt8(9);
    	  var event = '';
    	  switch(action)  {
    	    case 129:
    	      event = 'write';
    	      break;
    	    case 128:
    	      event = 'write';
    	      break;
    	    case 65:
    	      event = 'response';
    	      break;
    	    case 64:
    	      event = 'response';
    	      break;
    	    case 0:
    	      event = 'read';
    	      break;
    	  }
    	  
    	  if(action > 0) {
    	    
    	    // value
    	    var val = null;

    	    val = Buffer.from([telegram[telegram.length-1]]); // do not make it a number!
    	    if(len > 8) {
    	      val = telegram.slice(10, telegram.length);
    	    }
    	    let destGA = knxd.addr2str(dest, true);
//    	    console.log('Dest: ' + destGA);
    	    // we know the types so match it
    	    if (groupaddresses[destGA]) {
    	    	//known address with type
    	    	console.log('New telegram! --------------------------------------' + new Date().toString()	);
    	    	console.log(destGA + ' (' + groupaddresses[destGA].type + '): '+ groupaddresses[destGA].name);
    	    	console.dir(decode(val, groupaddresses[destGA].type ));
    	    }
    	    
    	    
    	  } else { // a READ telegram only
      	    if (groupaddresses[dest]) {
    	    	//known address with type
    	    	// console.dir(null, groupaddresses[dest] ));
    	    }
    	  }
    }
    this._inputBuffer = new Buffer(this._inputBuffer.slice(packetlen));
  }
};



var buslistener; 

function groupsocketlisten(opts) {
	var conn = knxd.Connection();
	conn.socketRemote(opts, function(err) {
		if (err) {
			console.log('[ERR] knxd connection failed: ' + err);
			//status.knxderrors += 1;
			return;
		}
		console.log('[OK] knxd connected.');
		conn.openGroupSocket(0, function(parser) {
			//telegramhandler(parser);
		});
	});

	conn.on('close', function() {
		// restart...
		console.log('[ERR] knxd disconnected.');
		setTimeout(function() {
			//status.knxderrors += 1;
			console.log('[ERR] knxd reconnect attempt.');
			groupsocketlisten(opts);
		}, 100);
	});
	console.log(typeof conn);
	buslistener = new BusListener(conn);
}

groupsocketlisten(config.knxd);


