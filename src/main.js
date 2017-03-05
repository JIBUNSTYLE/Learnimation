import Gif from './gif.js';
/**

GIFアニメを分割し、縦に連結してCSSでposition切り替えでどうにかしたい
http://qiita.com/narikei/items/d71cc6df60a6df66ab35
http://razokulover.hateblo.jp/entry/2017/02/23/164045

**/

// @see http://qiita.com/masashi127/items/9d81b0396f4834062ead
// @see http://qiita.com/1000ch/items/b24e387d6102ee20fbba
const owner = (document._currentScript || document.currentScript).ownerDocument;

const log = console.log;
const _URL = (URL && URL.createObjectURL) ? URL : webkitURL;

class Player {
  constructor(src, shadow) {
    this.isPlaying = false;
    this.shadow = shadow;
    
    this.player = shadow.querySelector('#player');
    this.elem = shadow.querySelector('#frames');
    this.controller = shadow.querySelector('#controller');
    this.progress = shadow.querySelector('#progress');

    this.gif = null;
    this.blobs = null;
    this.lastFrameIdx = 0;
    this.preserved = null;

    // 準備をするPromiseを返します
    this.ready = new Promise((resolve, reject) => {
      new Gif(src).load()
        .then( gif => { 
          return new Promise( (resolve, reject) => {
            // log(gif);

            this.gif = gif;
            const header = gif.header.toArrayBuffer();
            const blobs = gif.body.frames.map( f => {
              const body = gif.body.frame2ArrayBuffer(f);
              const blob = new Blob([ header, body ], {type: 'image/gif'});
              const url = _URL.createObjectURL(blob);
              return { 
                blob : blob
                , url : url
                , offset : f.offset
              };
            });

            resolve(blobs);
          });
        })
        .then( blobs => {
          this.blobs = blobs;
          this.elem.innerHTML = '';

          // アニメーションGIFをフレーム毎にばらしてimgタグで重ねて配置
          // 同時にdata-frame毎のスタイルを追加
          const styleSheet = document.createElement('style');
          styleSheet.media = 'screen';
          styleSheet.type = 'text/css';

          const width = this.gif.header.width;
          let css = `#controller { width: ${ width }px; opacity: 1; }`;
          for ( let i=0, l=blobs.length; i<l; i++ ) {
            const image = new Image();
            image.src = blobs[i].url;
            this.elem.appendChild(image);

            css += ` #player[data-frame="${i}"] img:nth-child(n + ${ i+2 }) { opacity: 0; }`
              + ` #player[data-frame="${i}"] img:nth-child(${ i+1 }) { opacity: 1; }`
              + ` #player[data-frame="${i}"] #progress { width: ${ 100*i/l }%; }`
              ;
          }

          const rule = document.createTextNode(css);
          styleSheet.appendChild(rule);
          shadow.appendChild(styleSheet);

          // Controllerでの再生位置制御
          let isMouseDown = false;
          // mousedown箇所に移動し中断
          this.controller.addEventListener('mousedown', e => {
            isMouseDown = true;
            const fraction = (e.layerX-e.target.offsetLeft) / width;

            // クリックした位置が、何番目のframeかを探す
            const current = this.gif.playTime * fraction;

            let i=1;
            for ( let l=this.blobs.length
              ; i < l && this.blobs[i].offset < current
              ; i++) 
            { 
              // none;
            }
      
            this.preserved = {
              fraction : fraction 
              , frameIdx : i-1
            };
            this.isPlaying = false;
          });

          // mousemoveで移動
          this.controller.addEventListener('mousemove', e => {
            if ( isMouseDown ) {
              const fraction = (e.layerX-e.target.offsetLeft) / width;

              // move後の位置が、何番目のframeかを探す
              const current = this.gif.playTime * fraction;

              let i=1;
              for ( let l=this.blobs.length
                ; i < l && this.blobs[i].offset < current
                ; i++) 
              { 
                // none;
              }

              this.player.dataset['frame'] = this.lastFrameIdx = i-1;
            }
          });

          // mouseupで中断箇所から再開
          this.controller.addEventListener('mouseup', e => {
            this.start();
          });

          resolve();
        });
    });
  }

  start(speed = 1) {
    this.startTime = performance.now();
    this.isPlaying = true;

    const initialOffset = this.blobs[this.lastFrameIdx].offset * 10; // マイクロ秒に揃える

    /**
     * playTime（GIFのDelayTime）はミリ秒（1/100)、performance.now()はマイクロ秒（1/1000)なので注意
     */
    const animationLoop = () => {
      const playTime = 10 * this.gif.playTime / speed // マイクロ秒に揃える
        , elapsedTime = performance.now() - this.startTime
        , repeatCount = (initialOffset + elapsedTime) / playTime
        , fraction = repeatCount % 1;

      // 現在、何番目のframeかを探す
      const current = this.gif.playTime * fraction;

      let i=1;
      for ( let l=this.blobs.length
        ; i < l && this.blobs[i].offset < current
        ; i++) 
      { 
        // none;
      }
      
      this.player.dataset['frame'] = i-1;

      if ( this.isPlaying ) {
        window.requestAnimationFrame(animationLoop);

      } else if ( this.preserved ) {
        this.player.dataset['frame'] = this.preserved.frameIdx;
        this.lastFrameIdx = this.preserved.frameIdx;
        this.preserved = null;

      } else {
        this.lastFrameIdx = i-1;
      }
    };

    animationLoop();
  }
}

class Learnimation extends HTMLElement {
  // MARK: - ライフサイクル
  // 要素のインスタンスが作られた時
  createdCallback() {
    log('createdCallback');
    this.addEventListener('mouseover', function(e) {
      if ( this.player && !this.player.isPlaying ) {
        this.player.start();
      }
    });
    this.addEventListener('mouseout', function(e) {
      if ( this.player ) {
        this.player.isPlaying = false;
      }
    });

    this.shadow = this.createShadowRoot();

    // stamp out our template in the shadow dom
    var template = owner.querySelector("#template").content.cloneNode(true);
    this.shadow.appendChild(template);

    this.setup(this.getAttribute('src'));
  }

  // インスタンスがドキュメントに追加された時
  attachedCallback() {
    log('attachedCallback');
  }

  // インスタンスがドキュメントから取り除かれた時
  detachedCallback() {
    log('detachedCallback');
  }

  // 属性が追加、削除、更新された時 
  attributeChangedCallback(attrName, oldVal, newVal) {
    log('attributeChangedCallback');
  }

  // MARK: - func

  setup(src) {
    if ( !src ) {
      log('src attribute is undefined.');
      return;
    }

    this.player = new Player(src, this.shadow);
    this.player.ready.then(() => {
      log('ready...');
    });
  }
}

// 独自エレメントをと登録
// タグ名はハイフンを含み必要がある
document.registerElement('learn-imation', Learnimation);
