
function bucksbox(options) {
    amount = options.amount
    token = options.token
    feerecordsIdStr = options.feerecordsIdStr
    //secret_key = options.secret_key
    
    //key = options.key
    Object.defineProperties(this, {
        "order_id": {
            get: function () { return order_id },
            set: function (value) { order_id = value }
        },
        "token": {
            get: function () { return token },
            set: function (value) { token = value }
        }
    });
    (function bucksboxWidget() {
        let bucksboxcssstyle = 'html,body{height:100%;background:none!important;margin: 0;}.bucksbox_wrapper{height:100%;position: fixed;width: 100%;top: 0;display:none;z-index:100000;}iframe{border:0;border-radius:5px;}#bucksboxPluginApiiframe{height:100%;border-radius:5px;margin:0;width:100%!important;}#bucksbox_container {margin: 0 auto; height: 100%;text-align: center;-webkit-transition: .3s ease-out opacity;-o-transition: .3s ease-out opacity;transition: .3s ease-out opacity;z-index: 2;}#bucksbox_backdrop { position: absolute;top:0px;left: 0;width: 100%;height: 100%;}#bucksbox_container.bucksbox_drishy {opacity: 1;white-space:nowrap;}#bucksbox_modal { opacity: 1;-webkit-transform: none; -ms-transform: none;transform: none;-webkit-transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;-o-transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform; transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;}#bucksbox_modal-inner {-webkit-border-radius: 3px;border-radius: 3px;height: 100%;}.bucksbox_close {text-decoration:none!important;position: absolute;right:5px;top:20px;cursor: pointer;background:none!important;border:none!important;color: #fff!important;line-height: 25px;font-size:25px!important;z-index: 1;padding:0;opacity:0.7;-webkit-transform: none;-ms-transform: none;transform: none;-webkit-transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;-o-transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;}.bucksbox_close:hover{opacity:1;}#bucksbox_options-wrap { position: absolute;top: 50%;-webkit-transform: translateY(-50%);-ms-transform: translateY(-50%);transform: translateY(-50%);left: 12px;right: 12px;z-index: 100;}#bucksbox_container.bucksbox_drishy #bucksbox_modal {opacity: 1;-webkit-transform: none;-ms-transform: none;transform: none;-webkit-transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;-o-transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;transition: .2s,.3s cubic-bezier(.3,1.5,.7,1) transform;}#bucksbox_modal { -webkit-border-radius: 3px;border-radius: 3px; -webkit-box-sizing: border-box;box-sizing: border-box;display: inline-block;-webkit-transition: .3s ease-in;-o-transition: .3s ease-in;transition: .3s ease-in;z-index: 1;-webkit-perspective: 300;perspective: 300;position: relative; opacity: 0;-webkit-transform: scale(.9);-ms-transform: scale(.9); transform: scale(.9);color: #333;font-size: 14px;width: 100%;font-family: ubuntu,helvetica,sans-serif;}.bucksbox_mchild {vertical-align: middle;display: inline-block; white-space: normal;height:100%}.bucksbox_lightBackWrap{min-height: 100%; transition: all 0.3s ease-out 0s; position: fixed; top: 0px; left: 0px; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.3) none repeat scroll 0% 0%;pointer-events: none;}#bucksbox_content{text-align: left;white-space: normal;position: fixed;left: auto;right: auto;width: 100%;height: 100%;top: 0;}.bucksbox_drishy:after{content:"";height:96%;display:inline-block;width:0;vertical-align:middle}',
            bucksboxhead = document.head || document.getElementsByTagName('head')[0],
            bucksboxstyle = document.createElement('style');
            bucksboxstyle.type = 'text/css';
        if (bucksboxstyle.styleSheet) {
            bucksboxstyle.styleSheet.cssText = bucksboxcssstyle;
        } else {
            bucksboxstyle.appendChild(document.createTextNode(bucksboxcssstyle));
        }
        bucksboxhead.appendChild(bucksboxstyle);
        let bucksboxviewPortTag = document.createElement('meta');
        bucksboxviewPortTag.id = "viewport";
        bucksboxviewPortTag.name = "viewport";
        bucksboxviewPortTag.content = "width=device-width; initial-scale=1.0;";
        document.getElementsByTagName('head')[0].appendChild(bucksboxviewPortTag);
        let bucksboxbody = document.getElementsByTagName('body');
        let documentContent = document.createElement("div");
        documentContent.classList.add("bucksbox_wrapper");
        documentContent.innerHTML = '<div id="bucksbox_bgWrapAdd"></div><div id="bucksbox_container"><div id="bucksbox_backdrop"></div><div id="bucksbox_modal" class="bucksbox_mchild"><div id="bucksbox_modal-inner"><div id="bucksbox_content"><iframe id="bucksboxPluginApiiframe" width="100%"></iframe></div></div></div></div>';
        document.body.appendChild(documentContent);
        var loading_bg = '<style type="text/css">html,body{height:100%;background:none!important;margin: 0;}#bucksbox_loading{display: table;height:100%;width:100%;}.bucksbox_loading_img{width:100%;height:100%;display: table-cell;vertical-align: middle;text-align:center}</style><div id="bucksbox_loading"><div class="bucksbox_loading_img"><img src="https://bucksbox-images.blr1.cdn.digitaloceanspaces.com/cms/A4%20-%202%20-%20Edited.png" width="100"></div></div>';
        document.getElementById("bucksboxPluginApiiframe").src = 'data:text/html,' + encodeURIComponent(loading_bg);
        /*document.getElementById("bucksbox_close").onclick = function () {
            window.postMessage({ "status": "closed", "data": "Payment Popup Closed" }, "*");
            document.getElementsByClassName("bucksbox_wrapper")[0].style.display = "none";
            document.getElementById("bucksbox_bgWrapAdd").classList.remove("bucksbox_lightBackWrap");
            document.getElementById("bucksbox_container").classList.remove("bucksbox_drishy");
        };*/
    })();
    this.open = (e) => {
        setTimeout(function () {
            document.getElementById("bucksboxPluginApiiframe").setAttribute('src', 'https://bucksfeelive.bucksbox.in/api/opayment/pay/' + amount + '?token=' + token + '&feerecordsIdStr=' + feerecordsIdStr)
            // document.getElementById("bucksboxPluginApiiframe").setAttribute('src', 'http://localhost:3008/api/opayment/pay')
            document.getElementsByClassName("bucksbox_wrapper")[0].style.display = "block";
            document.getElementById("bucksbox_bgWrapAdd").classList.add("bucksbox_lightBackWrap");
            document.getElementById("bucksbox_container").classList.add("bucksbox_drishy");
        }, 500);
    }
    this.close = (e) => {
        document.getElementsByClassName("bucksbox_wrapper")[0].style.display = "none";
        window.postMessage({ "status": "closed", "data": "Payment Popup Closed" }, "*");
        document.getElementById("bucksbox_bgWrapAdd").classList.remove("bucksbox_lightBackWrap");
        document.getElementById("bucksbox_container").classList.remove("bucksbox_drishy");
    }
}
var eventMethod = window.addEventListener ? "addEventListener" : "attachEvent";
var bucksboxHandler = window[eventMethod];
var response = eventMethod === "attachEvent" ? "onmessage" : "message";