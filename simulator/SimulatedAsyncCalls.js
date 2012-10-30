/* ********************************************************************************
 * Async calls simulation
 	Author: P.N. Anantharaman
 	Date: 4 Oct 2012
 **********************************************************************************/ 	
function asyncEcho(cb, t, str)
{
	setTimeout(function(){
                	returnFromAsyncFunc(cb, str);
    },t);
}

function asyncEcho1(t, cb, str)
{
	setTimeout(function(){
                	returnFromAsyncFunc(cb, str);
    },t);
}

function syncEcho(str)
{
	return str;
}

function asyncArith(cb, t, opr, arg1, arg2)
{
	setTimeout(function(){
		var result;
		if (opr == '+') result = arg1 + arg2;
		else if (opr == '-') result = arg1 - arg2;
		else if (opr == '*') result = arg1 * arg2;
		else if (opr == '/') result = arg1 / arg2;					
    	returnFromAsyncFunc(cb, result);
    },t);
}


function asyncBool(cb, t, opr, arg1, arg2)
{
	setTimeout(function(){
		var result;
		if (opr == '&&') result = arg1 && arg2;
		else if (opr == '==') result = arg1 == arg2;
		else if (opr == '===') result = arg1 === arg2;
		else if (opr == '||') result = arg1 || arg2;
		else if (opr == '!=') result = arg1 != arg2;					
    	returnFromAsyncFunc(cb, result);
    },t);
}

function syncArith(opr, arg1, arg2)
{
		var result;
		if (opr == '+') result = arg1 + arg2;
		else if (opr == '-') result = arg1 - arg2;
		else if (opr == '*') result = arg1 * arg2;
		else if (opr == '/') result = arg1 / arg2;					
    	return result;
}
function returnFromAsyncFunc (context, retValue)
{
	//console.log("in async echo, retValue: " + retValue);
	if (typeof context == 'function') 
		context({code:0, message:""}, retValue);
	else 
		if (typeof context == 'object') {
			var f = context.cb.pop(); 
			f({code:0, message:""}, retValue);
		}
}			

			
			function echo(str)
			{
				asyncEcho(function(e, ret) {alert("code = " + e.code + ", Value: " + ret);}, 1000, str);
			}

			function arith(opr, a1, a2)
			{
				asyncArith(function(ret) {alert(ret);}, 1000, opr, a1, a2);
			}
			

