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
  constructor(src, elem, shadow) {
    this.isPlaying = false;
    this.elem = elem;
    this.gif = null;
    this.blobs = null;
    this.lastFrameIdx = 0;

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

          const styleSheet = document.createElement('style');
          styleSheet.media = 'screen';
          styleSheet.type = 'text/css';

          let css = '';
          for ( let i=0, l=blobs.length; i<l; i++ ) {
            const image = new Image();
            image.src = blobs[i].url;
            this.elem.appendChild(image);

            css += ` #frames[data-frame="${i}"] img:nth-child(n + ${ i+2 }) { opacity: 0; }`
              + ` #frames[data-frame="${i}"] img:nth-child(${ i+1 }) { opacity: 1; }`
              ;
          }

          const rule = document.createTextNode(css);
          styleSheet.appendChild(rule);
          shadow.appendChild(styleSheet);
          
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
      const playTime = this.gif.playTime / speed * 10 // マイクロ秒に揃える
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
      
      this.elem.dataset['frame'] = i-1;

      if ( this.isPlaying ) {
        window.requestAnimationFrame(animationLoop);
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

    this.player = new Player(src, this.shadow.querySelector('#frames'), this.shadow);
    this.player.ready.then(() => {
      log('ready...');
    });
  }
}

// 独自エレメントをと登録
// タグ名はハイフンを含み必要がある
document.registerElement('learn-imation', Learnimation);
