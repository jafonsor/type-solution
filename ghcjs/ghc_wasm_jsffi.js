// This file implements the JavaScript runtime logic for Haskell
// modules that use JSFFI. It is not an ESM module, but the template
// of one; the post-linker script will copy all contents into a new
// ESM module.

// Manage a mapping from 32-bit ids to actual JavaScript values.
class JSValManager {
  #lastk = 0;
  #kv = new Map();

  newJSVal(v) {
    const k = ++this.#lastk;
    this.#kv.set(k, v);
    return k;
  }

  // A separate has() call to ensure we can store undefined as a value
  // too. Also, unconditionally check this since the check is cheap
  // anyway, if the check fails then there's a use-after-free to be
  // fixed.
  getJSVal(k) {
    if (!this.#kv.has(k)) {
      throw new WebAssembly.RuntimeError(`getJSVal(${k})`);
    }
    return this.#kv.get(k);
  }

  // Check for double free as well.
  freeJSVal(k) {
    if (!this.#kv.delete(k)) {
      throw new WebAssembly.RuntimeError(`freeJSVal(${k})`);
    }
  }
}

// The actual setImmediate() to be used. This is a ESM module top
// level binding and doesn't pollute the globalThis namespace.
//
// To benchmark different setImmediate() implementations in the
// browser, use https://github.com/jphpsf/setImmediate-shim-demo as a
// starting point.
const setImmediate = (() => {
  // node, deno, bun, or other scripts might have set this up in the
  // browser
  if (globalThis.setImmediate) {
    return globalThis.setImmediate;
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask
  if (globalThis.scheduler) {
    return (cb, ...args) => scheduler.postTask(() => cb(...args));
  }

  // Cloudflare workers doesn't support MessageChannel
  if (globalThis.MessageChannel) {
    // A simple & fast setImmediate() implementation for browsers. It's
    // not a drop-in replacement for node.js setImmediate() because:
    // 1. There's no clearImmediate(), and setImmediate() doesn't return
    //    anything
    // 2. There's no guarantee that callbacks scheduled by setImmediate()
    //    are executed in the same order (in fact it's the opposite lol),
    //    but you are never supposed to rely on this assumption anyway
    class SetImmediate {
      #fs = [];
      #mc = new MessageChannel();

      constructor() {
        this.#mc.port1.addEventListener("message", () => {
          this.#fs.pop()();
        });
        this.#mc.port1.start();
      }

      setImmediate(cb, ...args) {
        this.#fs.push(() => cb(...args));
        this.#mc.port2.postMessage(undefined);
      }
    }

    const sm = new SetImmediate();
    return (cb, ...args) => sm.setImmediate(cb, ...args);
  }

  return (cb, ...args) => setTimeout(cb, 0, ...args);
})();

export default (__exports) => {
const __ghc_wasm_jsffi_jsval_manager = new JSValManager();
const __ghc_wasm_jsffi_finalization_registry = globalThis.FinalizationRegistry ? new FinalizationRegistry(sp => __exports.rts_freeStablePtr(sp)) : { register: () => {}, unregister: () => true };
return {
newJSVal: (v) => __ghc_wasm_jsffi_jsval_manager.newJSVal(v),
getJSVal: (k) => __ghc_wasm_jsffi_jsval_manager.getJSVal(k),
freeJSVal: (k) => __ghc_wasm_jsffi_jsval_manager.freeJSVal(k),
scheduleWork: () => setImmediate(__exports.rts_schedulerLoop),
ZC0ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: ($1,$2) => ((new TextDecoder('utf-8', {fatal: true})).decode(new Uint8Array(__exports.memory.buffer, $1, $2))),
ZC1ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: ($1,$2,$3) => ((new TextEncoder()).encodeInto($1, new Uint8Array(__exports.memory.buffer, $2, $3)).written),
ZC2ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: ($1) => ($1.length),
ZC6ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: ($1) => ((...args) => __exports.ghczuwasmzujsffiZC5ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC($1, ...args)),
ZC8ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: ($1) => ((...args) => __exports.ghczuwasmzujsffiZC7ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC($1, ...args)),
ZC10ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: ($1) => ((...args) => __exports.ghczuwasmzujsffiZC9ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC($1, ...args)),
ZC11ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: async ($1,$2,$3) => {        var jsaddle_values = new Map();
        var jsaddle_free = new Map();
        jsaddle_values.set(0, null);
        jsaddle_values.set(1, undefined);
        jsaddle_values.set(2, false);
        jsaddle_values.set(3, true);
        jsaddle_values.set(4, globalThis);
        var jsaddle_index = 100;
        var expectedBatch = 1;
        var lastResults = [0, {"tag": "Success", "contents": [[], []]}];
        var inCallback = 0;
        var asyncBatch = null;

var syncDepth = 0;
var initialSyncDepth = 0;
(async () => {
  while (true) {
    const batch = JSON.parse(await $3());
  var runBatch = function(firstBatch) {
    var processBatch = function(timestamp) {
      var batch = firstBatch;
      var callbacksToFree = [];
      var results = [];
      inCallback++;
      try {
        syncDepth = initialSyncDepth || 0;
        for(;;){
          if(batch[2] === expectedBatch) {
            expectedBatch++;
            var nCommandsLength = batch[0].length;
            for (var nCommand = 0; nCommand != nCommandsLength; nCommand++) {
                var cmd = batch[0][nCommand];
                if (cmd.Left) {
                    var d = cmd.Left;
                    switch (d.tag) {
                            case "FreeRef":
                                var refsToFree = jsaddle_free.get(d.contents[0]) || [];
                                refsToFree.push(d.contents[1]);
                                jsaddle_free.set(d.contents[0], refsToFree);
                                break;
                            case "FreeRefs":
                                var refsToFree = jsaddle_free.get(d.contents) || [];
                                for(var nRef = 0; nRef != refsToFree.length; nRef++)
                                    jsaddle_values.delete(refsToFree[nRef]);
                                jsaddle_free.delete(d.contents);
                                break;
                            case "SetPropertyByName":
                                jsaddle_values.get(d.contents[0])[d.contents[1]]=jsaddle_values.get(d.contents[2]);
                                break;
                            case "SetPropertyAtIndex":
                                jsaddle_values.get(d.contents[0])[d.contents[1]]=jsaddle_values.get(d.contents[2]);
                                break;
                            case "EvaluateScript":
                                var n = d.contents[1];
                                jsaddle_values.set(n, eval(d.contents[0]));
                                break;
                            case "StringToValue":
                                var n = d.contents[1];
                                jsaddle_values.set(n, d.contents[0]);
                                break;
                            case "JSONValueToValue":
                                var n = d.contents[1];
                                jsaddle_values.set(n, d.contents[0]);
                                break;
                            case "GetPropertyByName":
                                var n = d.contents[2];
                                jsaddle_values.set(n, jsaddle_values.get(d.contents[0])[d.contents[1]]);
                                break;
                            case "GetPropertyAtIndex":
                                var n = d.contents[2];
                                jsaddle_values.set(n, jsaddle_values.get(d.contents[0])[d.contents[1]]);
                                break;
                            case "NumberToValue":
                                var n = d.contents[1];
                                jsaddle_values.set(n, d.contents[0]);
                                break;
                            case "NewEmptyObject":
                                var n = d.contents;
                                jsaddle_values.set(n, {});
                                break;
                            case "NewAsyncCallback":
                                (function() {
                                    var nFunction = d.contents;
                                    var func = function() {
                                        var nFunctionInFunc = ++jsaddle_index;
                                        jsaddle_values.set(nFunctionInFunc, func);
                                        var nThis = ++jsaddle_index;
                                        jsaddle_values.set(nThis, this);
                                        var args = [];
                                        for (var i = 0; i != arguments.length; i++) {
                                            var nArg = ++jsaddle_index;
                                            jsaddle_values.set(nArg, arguments[i]);
                                            args[i] = nArg;
                                        }
                                        $1(JSON.stringify({"tag": "Callback", "contents": [lastResults[0], lastResults[1], nFunction, nFunctionInFunc, nThis, args]}));
                                    };
                                    jsaddle_values.set(nFunction, func);
                                })();
                                break;
                            case "NewSyncCallback":
                                (function() {
                                    var nFunction = d.contents;
                                    var func = function() {
                                        var nFunctionInFunc = ++jsaddle_index;
                                        jsaddle_values.set(nFunctionInFunc, func);
                                        var nThis = ++jsaddle_index;
                                        jsaddle_values.set(nThis, this);
                                        var args = [];
                                        for (var i = 0; i != arguments.length; i++) {
                                            var nArg = ++jsaddle_index;
                                            jsaddle_values.set(nArg, arguments[i]);
                                            args[i] = nArg;
                                        }
                                        if(inCallback > 0) {
                                          $1(JSON.stringify({"tag": "Callback", "contents": [lastResults[0], lastResults[1], nFunction, nFunctionInFunc, nThis, args]}));
                                        } else {
                                          initialSyncDepth = 1;
                                          runBatch(JSON.parse($2(JSON.stringify({"tag": "Callback", "contents": [lastResults[0], lastResults[1], nFunction, nFunctionInFunc, nThis, args]}))));
                                        }
                                    };
                                    jsaddle_values.set(nFunction, func);
                                })();
                                break;
                            case "FreeCallback":
                                callbacksToFree.push(d.contents);
                                break;
                            case "CallAsFunction":
                                var n = d.contents[3];
                                jsaddle_values.set(n,
                                    jsaddle_values.get(d.contents[0]).apply(jsaddle_values.get(d.contents[1]),
                                        d.contents[2].map(function(arg){return jsaddle_values.get(arg);})));
                                break;
                            case "CallAsConstructor":
                                var n = d.contents[2];
                                var r;
                                var f = jsaddle_values.get(d.contents[0]);
                                var a = d.contents[1].map(function(arg){return jsaddle_values.get(arg);});
                                switch(a.length) {
                                    case 0 : r = new f(); break;
                                    case 1 : r = new f(a[0]); break;
                                    case 2 : r = new f(a[0],a[1]); break;
                                    case 3 : r = new f(a[0],a[1],a[2]); break;
                                    case 4 : r = new f(a[0],a[1],a[2],a[3]); break;
                                    case 5 : r = new f(a[0],a[1],a[2],a[3],a[4]); break;
                                    case 6 : r = new f(a[0],a[1],a[2],a[3],a[4],a[5]); break;
                                    case 7 : r = new f(a[0],a[1],a[2],a[3],a[4],a[5],a[6]); break;
                                    default:
                                        var ret;
                                        var temp = function() {
                                            ret = f.apply(this, a);
                                        };
                                        temp.prototype = f.prototype;
                                        var i = new temp();
                                        if(ret instanceof Object)
                                            r = ret;
                                        else {
                                            i.constructor = f;
                                            r = i;
                                        }
                                }
                                jsaddle_values.set(n, r);
                                break;
                            case "NewArray":
                                var n = d.contents[1];
                                jsaddle_values.set(n, d.contents[0].map(function(v){return jsaddle_values.get(v);}));
                                break;
                            case "SyncWithAnimationFrame":
                                var n = d.contents;
                                jsaddle_values.set(n, timestamp);
                                break;
                            case "StartSyncBlock":
                                syncDepth++;
                                break;
                            case "EndSyncBlock":
                                syncDepth--;
                                break;
                            default:
                                $1(JSON.stringify({"tag": "ProtocolError", "contents": e.data}));
                                return;
                    }
                } else {
                    var d = cmd.Right;
                    switch (d.tag) {
                            case "ValueToString":
                                var val = jsaddle_values.get(d.contents);
                                var s = val === null ? "null" : val === undefined ? "undefined" : val.toString();
                                results.push({"tag": "ValueToStringResult", "contents": s});
                                break;
                            case "ValueToBool":
                                results.push({"tag": "ValueToBoolResult", "contents": jsaddle_values.get(d.contents) ? true : false});
                                break;
                            case "ValueToNumber":
                                results.push({"tag": "ValueToNumberResult", "contents": Number(jsaddle_values.get(d.contents))});
                                break;
                            case "ValueToJSON":
                                var s = jsaddle_values.get(d.contents) === undefined ? "" : JSON.stringify(jsaddle_values.get(d.contents));
                                results.push({"tag": "ValueToJSONResult", "contents": s});
                                break;
                            case "ValueToJSONValue":
                                results.push({"tag": "ValueToJSONValueResult", "contents": jsaddle_values.get(d.contents)});
                                break;
                            case "DeRefVal":
                                var n = d.contents;
                                var v = jsaddle_values.get(n);
                                var c = (v === null           ) ? [0, ""] :
                                        (v === undefined      ) ? [1, ""] :
                                        (v === false          ) ? [2, ""] :
                                        (v === true           ) ? [3, ""] :
                                        (typeof v === "number") ? [-1, v.toString()] :
                                        (typeof v === "string") ? [-2, v]
                                                                : [-3, ""];
                                results.push({"tag": "DeRefValResult", "contents": c});
                                break;
                            case "IsNull":
                                results.push({"tag": "IsNullResult", "contents": jsaddle_values.get(d.contents) === null});
                                break;
                            case "IsUndefined":
                                results.push({"tag": "IsUndefinedResult", "contents": jsaddle_values.get(d.contents) === undefined});
                                break;
                            case "InstanceOf":
                                results.push({"tag": "InstanceOfResult", "contents": jsaddle_values.get(d.contents[0]) instanceof jsaddle_values.get(d.contents[1])});
                                break;
                            case "StrictEqual":
                                results.push({"tag": "StrictEqualResult", "contents": jsaddle_values.get(d.contents[0]) === jsaddle_values.get(d.contents[1])});
                                break;
                            case "PropertyNames":
                                var result = [];
                                for (name in jsaddle_values.get(d.contents)) { result.push(name); }
                                results.push({"tag": "PropertyNamesResult", "contents": result});
                                break;
                            case "Sync":
                                results.push({"tag": "SyncResult", "contents": []});
                                break;
                            default:
                                results.push({"tag": "ProtocolError", "contents": e.data});
                        }
                }
            }
            if(syncDepth <= 0) {
              lastResults = [batch[2], {"tag": "Success", "contents": [callbacksToFree, results]}];
              $1(JSON.stringify({"tag": "BatchResults", "contents": [lastResults[0], lastResults[1]]}));
              break;
            } else {
              lastResults = [batch[2], {"tag": "Success", "contents": [callbacksToFree, results]}];
              batch = JSON.parse($2(JSON.stringify({"tag": "BatchResults", "contents": [lastResults[0], lastResults[1]]})));
              results = [];
              callbacksToFree = [];
            }
          } else {
            if(syncDepth <= 0) {
              break;
            } else {
              if(batch[2] === expectedBatch - 1) {
                batch = JSON.parse($2(JSON.stringify({"tag": "BatchResults", "contents": [lastResults[0], lastResults[1]]})));
              } else {
                batch = JSON.parse($2(JSON.stringify({"tag": "Duplicate", "contents": [batch[2], expectedBatch]})));
              }
              results = [];
              callbacksToFree = [];
            }
          }
        }
      }
      catch (err) {
        var n = ++jsaddle_index;
        jsaddle_values.set(n, err);
        console.log(err);
        $1(JSON.stringify({"tag": "BatchResults", "contents": [batch[2], {"tag": "Failure", "contents": [callbacksToFree, results, n, String(err)]}]}));
      }
      if(inCallback == 1) {
          while(asyncBatch !== null) {
              var b = asyncBatch;
              asyncBatch = null;
              if(b[2] == expectedBatch) runBatch(b);
          }
      }
      inCallback--;
    };
    if(batch[1] && (initialSyncDepth || 0) === 0) {
        globalThis.requestAnimationFrame(processBatch);
    }
    else {
        processBatch(globalThis.performance ? globalThis.performance.now() : null);
    }
  };
  initialSyncDepth = 0;
  runBatch(batch);

  }
})();
},
ZC12ZCjsaddlezmwasmzm0zi1zi2zi1zmC0mOa4JFPZZd4uFv0kd8fBGZCLanguageziJavascriptziJSaddleziWasmziInternalZC: async () => {globalThis["h$isNumber"] = function(o) {    return typeof(o) === 'number';
};

// returns true for null, but not for functions and host objects
globalThis["h$isObject"] = function(o) {
    return typeof(o) === 'object';
};

globalThis["h$isString"] = function(o) {
    return typeof(o) === 'string';
};

globalThis["h$isSymbol"] = function(o) {
    return typeof(o) === 'symbol';
};

globalThis["h$isBoolean"] = function(o) {
    return typeof(o) === 'boolean';
};

globalThis["h$isFunction"] = function(o) {
    return typeof(o) === 'function';
};

globalThis["h$jsTypeOf"] = function(o) {
    var t = typeof(o);
    if(t === 'undefined') return 0;
    if(t === 'object')    return 1;
    if(t === 'boolean')   return 2;
    if(t === 'number')    return 3;
    if(t === 'string')    return 4;
    if(t === 'symbol')    return 5;
    if(t === 'function')  return 6;
    return 7; // other, host object etc
};

globalThis["h$jsonTypeOf"] = function(o) {
    if (!(o instanceof Object)) {
        if (o == null) {
            return 0;
        } else if (typeof o == 'number') {
            if (h$isInteger(o)) {
                return 1;
            } else {
                return 2;
            }
        } else if (typeof o == 'boolean') {
            return 3;
        } else {
            return 4;
        }
    } else {
        if (Object.prototype.toString.call(o) == '[object Array]') {
            // it's an array
            return 5;
        } else if (!o) {
            // null 
            return 0;
        } else {
            // it's an object
            return 6;
        }
    }

};
globalThis["h$roundUpToMultipleOf"] = function(n,m) {
  var rem = n % m;
  return rem === 0 ? n : n - rem + m;
};

globalThis["h$newByteArray"] = function(len) {
  var len0 = Math.max(h$roundUpToMultipleOf(len, 8), 8);
  var buf = new ArrayBuffer(len0);
  return { buf: buf
         , len: len
         , i3: new Int32Array(buf)
         , u8: new Uint8Array(buf)
         , u1: new Uint16Array(buf)
         , f3: new Float32Array(buf)
         , f6: new Float64Array(buf)
         , dv: new DataView(buf)
         }
};
globalThis["h$wrapBuffer"] = function(buf, unalignedOk, offset, length) {
  if(!unalignedOk && offset && offset % 8 !== 0) {
    throw ("h$wrapBuffer: offset not aligned:" + offset);
  }
  if(!buf || !(buf instanceof ArrayBuffer))
    throw "h$wrapBuffer: not an ArrayBuffer"
  if(!offset) { offset = 0; }
  if(!length || length < 0) { length = buf.byteLength - offset; }
  return { buf: buf
         , len: length
         , i3: (offset%4) ? null : new Int32Array(buf, offset, length >> 2)
         , u8: new Uint8Array(buf, offset, length)
         , u1: (offset%2) ? null : new Uint16Array(buf, offset, length >> 1)
         , f3: (offset%4) ? null : new Float32Array(buf, offset, length >> 2)
         , f6: (offset%8) ? null : new Float64Array(buf, offset, length >> 3)
         , dv: new DataView(buf, offset, length)
         };
};
globalThis["h$newByteArrayFromBase64String"] = function(base64) {
  var bin = globalThis.atob(base64);
  var ba = h$newByteArray(bin.length);
  var u8 = ba.u8;
  for (var i = 0; i < bin.length; i++) {
    u8[i] = bin.charCodeAt(i);
  }
  return ba;
};
globalThis["h$byteArrayToBase64String"] = function(off, len, ba) {
  var bin = '';
  var u8 = ba.u8;
  var end = off + len;
  for (var i = off; i < end; i++) {
    bin += String.fromCharCode(u8[i]);
  }
  return globalThis.btoa(bin);
};
},
ZC0ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: ($1,$2) => ($1.reject(new WebAssembly.RuntimeError($2))),
ZC18ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: ($1,$2) => ($1.resolve($2)),
ZC19ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: ($1) => ($1.resolve()),
ZC20ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: ($1) => {$1.throwTo = () => {};},
ZC21ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: ($1,$2) => {$1.throwTo = (err) => __exports.rts_promiseThrowTo($2, err);},
ZC22ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: () => {let res, rej; const p = new Promise((resolve, reject) => { res = resolve; rej = reject; }); p.resolve = res; p.reject = rej; return p;},
ZC23ZCghczminternalZCGHCziInternalziWasmziPrimziExportsZC: ($1,$2) => (__ghc_wasm_jsffi_finalization_registry.register($1, $2, $1)),
ZC18ZCghczminternalZCGHCziInternalziWasmziPrimziImportsZC: ($1,$2) => ($1.then(() => __exports.rts_promiseResolveUnit($2), err => __exports.rts_promiseReject($2, err))),
ZC0ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1) => (`${$1.stack ? $1.stack : $1}`),
ZC1ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1,$2) => ((new TextDecoder('utf-8', {fatal: true})).decode(new Uint8Array(__exports.memory.buffer, $1, $2))),
ZC2ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1,$2,$3) => ((new TextEncoder()).encodeInto($1, new Uint8Array(__exports.memory.buffer, $2, $3)).written),
ZC3ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1) => ($1.length),
ZC4ZCghczminternalZCGHCziInternalziWasmziPrimziTypesZC: ($1) => {try { __ghc_wasm_jsffi_finalization_registry.unregister($1); } catch {}},
ZC0ZCghczminternalZCGHCziInternalziWasmziPrimziConcziInternalZC: async ($1) => (new Promise(res => setTimeout(res, $1 / 1000))),
};
};
