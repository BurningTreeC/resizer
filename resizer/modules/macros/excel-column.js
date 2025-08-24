/*\
title: $:/plugins/BTC/resizer/modules/macros/excel-column.js
type: application/javascript
module-type: macro

Excel-style column label generator

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.name = "excel-column";

exports.params = [
	{name: "index"}
];

exports.run = function(index) {
	var n = parseInt(index) - 1;
	if (n < 0) return "";

	var result = "";
	while (n >= 0) {
		result = String.fromCharCode(65 + (n % 26)) + result;
		n = Math.floor(n / 26) - 1;
	}
	return result;
};
