/*
SyncToAsyncEvaluator.js - contains the custom tree walker that generates synchronous to asynchronous transformation
Druta (meaning, quick/swift/run in Sanskrit, is a runtime that executed abstract instructions on top of JS.
Date: 26 Oct 2012

The objective of Druta is to simplify asynchronous programming that is very common while developing HTML5 applications.

Druta allows a developer to write Javascript code in a synchronous way and executes it on the Javascript runtime on the browser. 
This also can run on server side JS systems like node.js.

Druta has 2 broad sub systems:

(a) Druta Compiler: This takes the input as a JS source function object, parses it to ast, transforms the ast to another tree, generates Druta executable code
(b) Druta Runtime:  This takes the Druta executable code, sequences the different instructions for execution and executes them on JS runtime

This work uses the Uglify JS parser and Tree walker: https://github.com/mishoo/UglifyJS by Mihai Bazon, thanks much Mihai!

Supported Methods:

1. compile(jsSource) - this methods accepts a function written in JS as input, generates the Druta executable code as output and returns it
2. run(jsSource) - performs the compile step and also executes
3. run(drutaExecutable) - this method accepts a druta executable code as input and executes it. 
   It returns 0 if the input is a JS source or an array, otherwise it returns -1
   
Typical usage:

Pattern 1: compile first and then run 
	d = new Druta(pass_your_callback_function_here);
	code = d.compile(function test() { //your druta application code here });
	d.run(code); 
	
Pattern 2: Compile and run in 1 step
	d = new Druta(pass_your_callback_function_here);
	d.run(function test() { //your druta application code here });

  -------------------------------- (C) ---------------------------------

                         Author: Anantharaman Palacode Narayana Iyer
                         <narayana.anantharaman@gmail.com>

  Distributed under the BSD license:

    Copyright 2010 (c) Anantharaman Palacode Narayana Iyer, <narayana.anantharaman@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.


*/
__DrutaExecutableCode = null;
var scopeTable = {};

function getDrutaExecutableCode()
{
	return __DrutaExecutableCode;	  
};

function instrument(code) {
	DRUTA_RE = "\\$\\$(success|fail|callBack)"; //regular expression that represents Druta runtime
	Status = {async:false, asyncName: false};
    var ast = jsp.parse(code, false); // true for the third arg specifies that we want
                                                // to have start/end tokens embedded in the
                                                // statements
    var w = ast_walker();
	var counterForTemps = 0;
	const TEMPVAR = "__DrutaTemp_";
	syncList1 = [];
	syncList = syncList1;
	nodeSequence = ["toplevel", []]; //["toplevel", []]	
	codeBuffer = nodeSequence[1]; // this will be used to store the code buffer where the evaluators need to produce the output
	
	tempStack = []; //stack that holds the temp variables created from doCall - each call is represented by a temp var
	 
        // we're gonna need this to push elements that we're currently looking at, to avoid
        // endless recursion.
    var analyzing = [];
	function passThrough() {
		return null;
	}

	function getTempName()
	{
		return TEMPVAR + counterForTemps++;	
	};
	
	function currentTempName()
	{
		return TEMPVAR + (counterForTemps - 1);
	}

	function generateDrutaExecutableCode()
	{
		var codeArray = [];			
		function genBlockCode(a, c){
			for (var i = 0; i < a.length; i++) {
				c.push(genCode(a[i]));
			}
		}
		
		var genCode = function(ins) {
				switch(ins.command) {
					case "if":
						var temp = [];
						ins.condCode = gen_code(ins.cond, {beautify:true});
						genBlockCode(ins.thenCode, temp);
						ins.thenCode = temp;
						temp = [];
						genBlockCode(ins.elseCode, temp);
						ins.elseCode = temp;
						return({
							"async": ins.async,
							"command": ins.command,
							"condCode": ins.condCode,
							"thenCode": ins.thenCode,
							"elseCode": ins.elseCode
						});
						break;
					case "for":
						var temp = [];
						genBlockCode(ins.condCode, temp);
						ins.condCode = temp;
						temp = [];
						genBlockCode(ins.stepCode, temp);
						ins.stepCode = temp;
						temp = [];
						genBlockCode(ins.bodyCode, temp);
						ins.bodyCode = temp;
						return({
							"async": ins.async,
							"command": ins.command,
							"condCode": ins.condCode,
							"stepCode": ins.stepCode,
							"bodyCode": ins.bodyCode
						});
						break;
					case "defun":
						var temp = [];
						console.log("processing func statement");
						genBlockCode(ins.code, temp);
						ins.code = temp;
						return({
							"async": ins.async,
							"command": ins.command,
							"code" : ins.code,
							"args" : null,
							"name" : ins.name
						});
						break;
					default:
						return({"async": ins.async, "command": ins.command, "code": gen_code(ins.code, {beautify:true})});
						break;
				}; //switch
			}
			genBlockCode(nodeSequence[1], codeArray);
			return codeArray;
	}

	function doTopLevel(statements) {
			var ret = MAP(statements, w.walk);
			if (syncList.length > 0) nodeSequence[1].push.apply(nodeSequence[1], syncList);
			syncList = [];
            return [ this[0], ret ];
    }

    function doVar(defs) {
		//return null;
		var async = []; 
		var temp = ["name", "null"];
		var index = 0;
		var status = Status.async;
		var ret = MAP(defs, function(def){
            var a = [ def[0] ];
			async[index] = null;
            if (def.length > 1) {
                a[1] = w.walk(def[1]);
				temp = a[1]; // ["stat", ["assign", true, ["dot", ["name", "$$locals"], a[0]], a[1]]];				
				if (Status.async) {
					Status.async = false;
					async[index] = [a[0], currentTempName()];
					a = [a[0]]; //get rid of the async expression as it would have been handled already
					temp = ["name", "null"]; 
				}			
			}
			scopeTable[a[0]] = true; //add the current variable name in the scope
			a = ["stat", ["assign", true, ["dot", ["name", "$$locals"], a[0]], temp]];
			index++;
            return a;
        }); 
		var allDefs = ["splice", []]; //we will be creating a var list each when an async is encountered and splice all of them in this array
		var ret1 = [];
		for (var i = 0; i < ret.length; i++) //for each var definition in the list do
		{
			ret1.push(ret[i]);
			if (async[i] == null) {
				continue;
			}; //
			allDefs[1].push(["splice", ret1]);
			allDefs[1].push([ "stat", [ "assign", true, ["dot", ["name", "$$locals"], async[i][0]], ["name", "self.returnValue"] ] ]);
			ret1 = [];
		}        
		if (ret1.length > 0) allDefs[1].push(["splice", ret1]);
		syncList.push({"async": false, "command": "splice", code: allDefs }); //["var", ["x1", ["num", 0] ] ]
        Status.async = status;
		return ["splice", ret]; // [ this[0], ret];
    };
	
    function doStat(stat) {
		var ret = w.walk(stat);
		if (Status.async)
		{
			Status.async = false;
		}
		else
		{
			//syncList.push({"async": false, "command": this[0], code: [this[0], ret]});										
		}
		return [this[0], ret];
    };
	
	function doBreak(label)
	{
		syncList.push({"async": false, "command": this[0], code: [this[0], label]});										
		return [ this[0], label ];	
	}
	
	function doCall(expr, args)
	{
		var ret;
		var num = counterForTemps;
		
		Status.async = true; //added for testing the bug fix now
		
		var status = Status.async;
		
		var status1 = Status.asyncName;
		Status.asyncName = false;
		
		Status.async = false;
		var paramList = [];
		var ret1 = w.walk(expr);
		var ret2 = MAP(args, w.walk);
		var s2 = [ "stat", [ "assign", true, ["name", getTempName()], ["name", "self.returnValue"] ] ];

		num1 = counterForTemps;
		
		for (var i = 0; i < ret2.length; i++) //look at each element and set up the instruction accordingly
		{
			if (ret2[i][0] == "splice")
			{
				paramList.push(tempStack.pop());				
			}
			else
			{
				paramList.push(ret2[i]);
			}
		}		
		ret = ["splice", [ [ "stat", [ this[0], ret1, paramList] ], s2]]
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);
		codeBuffer.push({"async": Status.asyncName, "command": this[0], code: [ "stat", [ this[0], ret1, paramList] ] });
		Status.asyncName = false;
		
		syncList = [];
		syncList.push({"async": false, "command": "stat", code: [ "stat", [ "assign", true, ["name", currentTempName()], ["name", "self.returnValue"] ] ]});
		tempStack.push(["name", currentTempName()]); //save the name of temp variable that represents the output of this call on the tempStack										
		Status.async = status;
		Status.asyncName = status1;
		return ret;
	}
	
	function doAssign(op, lvalue, rvalue)
	{
		var ret1 = w.walk(lvalue);
		var ret2 = w.walk(rvalue);
		var varName;
		var s1 = [ "stat", [ "assign", true, ret1, ["name", currentTempName()] ] ];

		if (Status.async)
		{
			//we now need to make the assignment as the final statement - ret2 above will have the expression
			//TODO: need to fix hardcoding like ret1[1] as below
			syncList.push({"async": false, "command": "stat", code: s1});										
            var ret = [ "splice", // XXX: "block" is safer
                  	[ 
					  ["stat", ret2],
					  s1					
					]
				  ];
			return ret;			
		}
		syncList.push({"async": false, "command": "stat", code: [ this[0], op, ret1, ret2 ]});										
        return [ this[0], op, ret1, ret2 ];
	}
	
	function doUnary(op, expr)
	{
		var ret1;		
		var status;
		status = Status.async;				
		Status.async = false;
		ret1 = w.walk(expr);
		if (Status.async) {
			var name1 = currentTempName(); //name1 contains the name of expr1
			Status.async = true;
	        var ret = [ "splice", [ ["stat", ret1], [this[0], op, ["name", name1]] ] ];
			syncList.push({"async": false, "command": this[0], code:[this[0], op, ["name", name1]] });
			return ret;			
		}
		else {
			Status.async = status;														
			syncList.push({"async": false, "command": this[0], code: [ this[0], op, ret1]});
			return [ this[0], op, ret1];				
		}			
	}
	
	function doBinary(op, left, right)
	{
		var ret1, ret2;
		
		var status = [];
		status.push(Status.async);
		
		Status.async = false;
		ret1 = w.walk(left);
		if (Status.async)
		{
			Status.async = false;
			var name1 = currentTempName(); //name1 contains the name of expr1
			ret2 = w.walk(right);
			if (Status.async)
			{
				//both expr1 and expr2 are async
				Status.async = true;
				var name2 = currentTempName(); //name2 contains the name of expr2
				var s1 = [ "stat", [ "assign", true, ["name", getTempName()], ["binary", op, ["name", name1], ["name", name2]] ] ];
	            var ret = [ "splice", // XXX: "block" is safer
                  	[ 
					  ["stat", ret1],
					  ["stat", ret2],
					  s1					
					]
				  ];
				syncList.push({"async": false, "command": "stat", code: s1});
				
				tempStack.push(["name", currentTempName()]);													
				return ret;			
			}
			else
			{
				//expr1 async and expr2 sync
				Status.async = true;
				var s1 = [ "stat", [ "assign", true, ["name", getTempName()], ["binary", op, ["name", name1], ret2] ] ]; 
	            var ret = [ "splice", // XXX: "block" is safer
                  	[ 
					  ["stat", ret1],
					  s1					
					]
				  ];
				syncList.push({"async": false, "command": "stat", code: s1});														
				tempStack.push(["name", currentTempName()]);													
				return ret;			
			}
		}
		else
		{
			//expr1 sync
			Status.async = false;
			ret2 = w.walk(right);
			var name2 = currentTempName();
			if (Status.async)
			{
				//expr1 sync and expr2 async
				Status.async = true;				
				var s1 = [ "stat", [ "assign", true, ["name", getTempName()], ["binary", op, ret1, ["name", name2]] ] ];
	            var ret = [ "splice", // XXX: "block" is safer
                  	[ 
					  ["stat", ret2],
					  s1					
					]
				  ];
				syncList.push({"async": false, "command": "stat", code: s1});														

				tempStack.push(["name", currentTempName()]);													
				return ret;				
			}
			else
			{
				//expr1 sync and expr2 sync
				Status.async = status.pop();														
				return [ this[0], op, ret1, ret2 ];				
			}			
		}
	}

	function doIf(conditional, t, e) //test condition, then statements, else statements
	{
		var ret1, ret2, ret3, name1, name2, name3;
		var status = [];
		var temp1 = codeBuffer; //save code buffer as we are going to overwrite it
		var temp2 = []; //syncList; //save syncList as we are going to overwrite it
		temp2.push(syncList);
		var thenCode = [];
		var elseCode = [];
		var async = false;
				
		status.push(Status.async); //preserve the original status when we enter this function
		Status.async = false;
		ret1 = w.walk(conditional); name1 = currentTempName();	
		if (Status.async)
		{
			async = true;
		}
		else
		{
			async = false;
		};
		
		status.push(Status.async);
		Status.async = false;			
		
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);
		var sList = temp2.pop();
		sList.length = 0;
		temp2.push(sList);
	
		codeBuffer = thenCode; //create the buffer required to hold then statements
		syncList = new Array();	
																			
		ret2 = w.walk(t); name2 = currentTempName();
		// now, the code buffer will contain the code for then block and that will be in thenCode
				
		status.push(Status.async);
		Status.async = false;					
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);
																		
		codeBuffer = elseCode; //create the buffer required to hold then statements
		syncList = new Array();																
		ret3 = w.walk(e); name3 = currentTempName();
		// now, the code buffer will contain the code for else block and that will be in elseCode
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);
		
		//restore codeBuffer and syncList
		codeBuffer = temp1;
		syncList = temp2.pop();
		
		//create the necessary if statement in the code buffer
		if (async)	syncList.push({"async": false, "command": "if", "cond": ["name", name1], "thenCode": thenCode, "elseCode": elseCode}); 
		else syncList.push({"async": false, "command": "if", "cond": ret1, "thenCode": thenCode, "elseCode": elseCode}); 																				
		var s1 = [ "if", ret1, ret2, ["name", name3] ];
		var s2 = [ "if", ret1, ["name", name2], ret3 ];
		var s3 = [ "if", ret1, ["name", name2], ["name", name3] ];
		var s4 = [ "if", ["name", name1], ret2, ret3 ];
		var s5 = [ "if", ["name", name1], ret2, ["name", name3] ];
		var s6 = [ "if", ["name", name1], ["name", name2], ret3 ];
		var s7 = [ "if", ["name", name1], ["block", [["stat", ret2]]], ["block", [["stat", ret3]]] ];
		var sArray = [null, s1, s2, s3, s4, s5, s6, s7];
		
        var retArray = [[ this[0], ret1, ret2, ret3 ], //000
				   [ "splice", // XXX: "block" is safer 001
                  	[ 
					  ["stat", ret3],
					  [ "if", ret1, ret2, ["name", name3] ]					
					]
				  ],				
				  [ "splice", // XXX: "block" is safer 010
                  	[ 
					  ["stat", ret2],
					  [ "if", ret1, ["name", name2], ret3 ]					
					]
				  ],				
				  [ "splice", // XXX: "block" is safer 011
                  	[ 
					  ["stat", ret2],
					  ["stat", ret3],
					  [ "if", ret1, ["name", name2], ["name", name3] ]					
					]
				  ],				
				  [ "splice", // XXX: "block" is safer 100
                  	[ 
					  ["stat", ret1],
					  [ "if", ["name", name1], ret2, ret3 ]					
					]
				  ],				
				  [ "splice", // XXX: "block" is safer 101
                  	[ 
					  ["stat", ret1],
					  ["stat", ret3],
					  [ "if", ["name", name1], ret2, ["name", name3] ]					
					]
				  ],				
				  [ "splice", // XXX: "block" is safer 110
                  	[ 
					  ["stat", ret1],
					  ["stat", ret2],
					  [ "if", ["name", name1], ["name", name2], ret3 ]					
					]
				  ],				
				  [ "splice", // XXX: "block" is safer
                  	[ 
					  ["stat", ret1],
					  [ "if", ["name", name1], ["block", [["stat", ret2]]], ["block", [["stat", ret3]]] ]					
					]
				  ]
				 ];
				  
			var ind = Status.async + (status.pop() * 2) + (status.pop() * 4);
			var ret = retArray[ind]; //note: we are treating a bool variable like integer
			status.pop();		
		    return ret;
	}
	
	function doFor(init, cond, step, block) //test condition, then statements, else statements
	{
		/*
		 * we break the for statement in to: init code, condition, body and steps
		 * assume that the init code is already handled 
		 * we need to form an instruction that captures condition, body and steps
		 */

		var ret1, ret2, ret3, ret4, name1, name2, name3, name4;
		var status = [];
		var temp1 = codeBuffer; //save code buffer as we are going to overwrite it
		var temp2 = []; //syncList; //save syncList as we are going to overwrite it
		temp2.push(syncList);
		var condCode = [];
		var bodyCode = [];
		var stepCode = [];
		var async = false;
				
		status.push(Status.async); //preserve the original status when we enter this function
		Status.async = false;
		
		ret1 = w.walk(init); name1 = currentTempName();	
		//if (!Status.async) syncList.push({"async": false, "command": "stat", "code": ["stat", ret1]});
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);
		var sList = temp2.pop();
		sList.length = 0;
		temp2.push(sList);
			
		if (Status.async)
		{
			async = true;
		}
		else
		{
			async = false;
			//syncList.push({"async": false, "command": "if", "cond": ret1}); //test the condition which will be in a temp variable																				
		};
		
		status.push(Status.async);
		Status.async = false;			

		codeBuffer = condCode; //create the buffer required to hold then statements
		syncList = new Array();	
																			
		ret2 = w.walk(cond); name2 = currentTempName();
				
		// now, the code buffer will contain the code for cond and that will be in condCode
		status.push(Status.async);
		if (Status.async) {
			if (syncList.length > 0) 
				codeBuffer.push.apply(codeBuffer, syncList);
		}
		else 
			codeBuffer.push({
				"async": false,
				"command": ret2[0],
				code: ret2
			});
																					
		codeBuffer = stepCode; //create the buffer required to hold then statements
		syncList = new Array();																
		Status.async = false;					

		ret3 = w.walk(step); name3 = currentTempName();

		// now, the code buffer will contain the code for body block and that will be in bodyCode
		if (Status.async) {
			if (syncList.length > 0) 
				codeBuffer.push.apply(codeBuffer, syncList);
		}
		else 
			codeBuffer.push({
				"async": false,
				"command": ret3[0],
				code: ret3
			});

		codeBuffer = bodyCode; //create the buffer required to hold then statements
		syncList = new Array();																

		ret4 = w.walk(block); name4 = currentTempName();
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);
		
		//restore codeBuffer and syncList
		codeBuffer = temp1;
		syncList = temp2.pop();
		
		//create the necessary if statement in the code buffer
		syncList.push({"async": false, "command": "for", "condCode": condCode, "bodyCode": bodyCode, "stepCode": stepCode}); 
		status.pop();		
        var ret = [ this[0], ret1, ret2, ret3, ret4 ];
	    return ret;
	}


	function doDefun(name, args, body)
	{
		//return [ this[0], name, args.slice(), MAP(body, walk) ];
		var slist = syncList; //save the syncList as the following walk will modify it
		var cbuf = codeBuffer;
		var fCode = [];
		syncList = [];
		codeBuffer = fCode;
		
		var map = MAP(body, w.walk);
		if (syncList.length > 0) codeBuffer.push.apply(codeBuffer, syncList);

		var ret = [ this[0], name, args.slice(), map ];
		
		syncList.push({"async": false, "command": this[0], "name": name, "code": fCode });
		return ret;
	}		
	
	function doDot(expr)
	{
		var ret1;		
		var status;
		status = Status.async;				
		Status.async = false;
		ret1 = w.walk(expr);
		if (Status.async) {
			var name1 = currentTempName(); //name1 contains the name of expr1
			Status.async = true;
	        var ret = [ "splice", [ ["stat", ret1], [this[0], ["name", name1]].concat(slice(arguments, 1)) ] ];
			var s1 = [ "stat", [ "assign", true, ["name", getTempName()], [this[0], ["name", name1]].concat(slice(arguments, 1)) ] ];
			tempStack.push(["name", currentTempName()]); 										
			syncList.push({"async": false, "command": this[0], code:s1 });
			//syncList.push({"async": false, "command": this[0], code:[this[0], ["name", name1]].concat(slice(arguments, 1)) });
			return ret;			
		}
		else {
			Status.async = status;														
			//syncList.push({"async": false, "command": this[0], code: [ this[0], ret1 ].concat(slice(arguments, 1))});
			return [ this[0], ret1 ].concat(slice(arguments, 1));				
		}			
		
		
		
	}		
	
    var new_ast = w.with_walkers({
				"name"	   : function(name) {
								var nameRE = new RegExp(DRUTA_RE);
								if (name.match(nameRE)) {
									Status.async = true;
									Status.asyncName = true;
								} 
								if (name in scopeTable)
								{
									return ["dot", ["name", "$$locals"], name];
								} 
								else
								{
	            					return [ this[0], name ];									
								}
        					 },
                "stat"     : doStat,
                "label"    : passThrough,
                "break"    : doBreak, //passThrough,
                "continue" : doBreak, //passThrough,
                "debugger" : passThrough,
                "var"      : doVar, //passThrough,
                "const"    : passThrough,
                "return"   : passThrough,
                "throw"    : passThrough,
                "try"      : passThrough,
                "defun"    : doDefun, //passThrough,
                "if"       : doIf,
                "while"    : passThrough,
                "do"       : passThrough,
                "for"      : doFor, //passThrough,
                "for-in"   : passThrough,
                "switch"   : passThrough,
                "with"     : passThrough,
				
                "toplevel" : doTopLevel,
                "call"     : doCall,
                "assign"   : doAssign,
		        "binary"   : doBinary,
				"unary-prefix"	: doUnary,
				"unary-postfix"	: doUnary,
				"dot"		: doDot, 				
        	}, function(){
                return w.walk(ast);
        });
		__DrutaExecutableCode = null; //initialize the excutable to null
		__DrutaExecutableCode = generateDrutaExecutableCode();
        return gen_code(new_ast, { beautify: true });
} 

 