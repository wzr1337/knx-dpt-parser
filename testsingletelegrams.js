/* For Testing only *************************************************************************************
 * 
 */
'use strict';
//let groupaddresses = JSON.parse(require('fs').readFileSync('grouplist.json', 'utf-8'));

var decode = require('./Decoder').convenienceDecode;

console.log(decode(Buffer.from([0x19, 0x02, 0x11]), 'DPST-11-1', 'de-DE-u-co-phonebk' ));
/*
 { '0': { value: null, interpretation: 'reserved' },
  '1': { value: 25, Unit: 'Day of month' },
  '2': { value: null, interpretation: 'reserved' },
  '3': { value: 2, Unit: 'Month' },
  '4': { value: null, interpretation: 'reserved' },
  '5': { value: 2017, Unit: 'Year' },
  TypeText: 'date',
  DPT: 'DPST-11-1',
  subitems: 6,
  value: '2017-02-25' }

 */
console.log(decode(Buffer.from([0b11010001, 0b00110111, 0b00101000]), 'DPST-10-1')); // Sat, 17:55:40
/*
 { '0': { value: 6, interpretation: 'Saturday', Name: 'Day' },
  '1': { value: 17, Unit: 'hours', Name: 'Hour' },
  '2': { value: null, interpretation: 'reserved' },
  '3': { value: 55, Unit: 'minutes', Name: 'Minutes' },
  '4': { value: null, interpretation: 'reserved' },
  '5': { value: 40, Unit: 'seconds', Name: 'Seconds' },
  TypeText: 'time of day',
  DPT: 'DPST-10-1',
  subitems: 6,
  value: '17:55:40' }

 */
console.log(decode(Buffer.from([0b11010001, 0b00110111, 0b00101000]), 'DPST-232-600')); // RGB 209/55/40
/*
 { '0': { value: 209, Name: 'R' },
  '1': { value: 55, Name: 'G' },
  '2': { value: 40, Name: 'B' },
  TypeText: 'RGB value 3x(0..255)',
  DPT: 'DPST-232-600',
  subitems: 3 } 
 */

console.log(decode(Buffer.from([240]), 'DPST-5-1'));