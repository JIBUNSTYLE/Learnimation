LEARNIMATION
==============

## Description

The Learnimation is customized GIF Images intended to help understanding. The Learnimation refers to [x-gif](https://github.com/geelen/x-gif).

mouseover時のみ再生され、mouseoutすると再生が止まります。
再度mouseoverして再生する際は、前回の位置から再開します。

Web Componentsを利用し、独自タグとして機能するように実装しています。

```
	<learn-imation src="hogehoge.gif" />
```

## 開発

### 前提条件

* ES2015

### 事前準備

```
$ npm i -g yarn

```

### セットアップ

```
$ yarn install
```

## TODO

* mouseout時は画像がフェードで点滅するようにしたい
* 操作可能なプログレスバーを付ける