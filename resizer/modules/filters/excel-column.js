/*\
title: $:/plugins/BTC/resizer/modules/filters/excel-column.js
type: application/javascript
module-type: filteroperator

Filter operator for converting numbers to Excel-style column labels

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports["excel-column"] = function(source,operator,options) {
	var results = [];
	
	source(function(tiddler,title) {
		var n = parseInt(title) - 1;
		if (n >= 0) {
			var result = "";
			while (n >= 0) {
				result = String.fromCharCode(65 + (n % 26)) + result;
				n = Math.floor(n / 26) - 1;
			}
			results.push(result);
		}
	});
	
	return results;
};