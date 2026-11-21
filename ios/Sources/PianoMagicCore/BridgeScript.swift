public enum BridgeScript {
    public static let handlerName = "nativeMidi"
    public static let actionKey = "action"
    public static let startAction = "start"
    public static let engineDirectory = "engine/v1/"
    static let globalName = "window.__nativeMidi"
    static let engineRootName = "window.__pianoEngineRoot"

    public static var documentStart: String {
        engineRoot + "\n" + midiAccess
    }

    static var engineRoot: String {
        "\(engineRootName)='\(WebFiles.rootURL.absoluteString)\(engineDirectory)';"
    }

    static let midiAccess = """
    (function(){
    var h=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.\(handlerName);
    if(!h||!window.navigator)return;
    var inputs=new Map(),waiting=[],access=null,ready=false;
    function input(id){return{id:id,type:'input',state:'connected',connection:'open',onmidimessage:null};}
    function size(n){
    var i;
    for(i=0;i<n;i++){var id='native-'+i;if(!inputs.has(id))inputs.set(id,input(id));}
    Array.from(inputs.keys()).slice(n).forEach(function(k){inputs.delete(k);});
    }
    function make(){
    if(!access)access={inputs:inputs,outputs:new Map(),sysexEnabled:false,onstatechange:null};
    return access;
    }
    function settle(fn){var list=waiting;waiting=[];list.forEach(fn);}
    \(globalName)={
    emit:function(m){
    if(!m)return;
    var data=new Uint8Array([m.status,m.data1,m.data2]);
    var target=null;
    inputs.forEach(function(i){if(!target&&typeof i.onmidimessage==='function')target=i;});
    if(target)target.onmidimessage({data:data,timeStamp:performance.now(),target:target});
    },
    devices:function(n){
    size(n||0);
    var a=make();
    var first=!ready;
    ready=true;
    settle(function(p){p[0](a);});
    if(!first&&typeof a.onstatechange==='function')a.onstatechange({});
    },
    blocked:function(){
    settle(function(p){p[1](new DOMException('MIDI unavailable','NotAllowedError'));});
    }
    };
    window.navigator.requestMIDIAccess=function(){
    return new Promise(function(resolve,reject){
    if(ready){resolve(make());return;}
    waiting.push([resolve,reject]);
    try{h.postMessage({\(actionKey):'\(startAction)'});}catch(e){\(globalName).blocked();}
    });
    };
    })();
    """

    public static func emit(_ note: MidiNote) -> String {
        let payload = "{\"status\":\(note.status),\"data1\":\(note.data1),\"data2\":\(note.data2)}"
        return call("emit", payload)
    }

    public static func devices(_ count: Int) -> String {
        call("devices", String(count))
    }

    public static func blocked() -> String {
        call("blocked", "")
    }

    static func call(_ method: String, _ argument: String) -> String {
        "\(globalName)&&\(globalName).\(method)(\(argument))"
    }
}
