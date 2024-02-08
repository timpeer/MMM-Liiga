# MMM-NHL [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](https://raw.githubusercontent.com/fewieden/MMM-NHL/master/LICENSE) ![Build status](https://github.com/fewieden/MMM-NHL/workflows/build/badge.svg) [![Code Climate](https://codeclimate.com/github/fewieden/MMM-NHL/badges/gpa.svg?style=flat)](https://codeclimate.com/github/fewieden/MMM-NHL) [![Known Vulnerabilities](https://snyk.io/test/github/fewieden/mmm-nhl/badge.svg)](https://snyk.io/test/github/fewieden/mmm-nhl)

Finnish Major Icehockey league Liiga Module for MagicMirror²

This is fork from https://github.com/fewieden/MMM-NHL module

Big hand to these guys, fewieden and rest of the MMM-NHL module contrubutors 
https://github.com/fewieden/MMM-NHL/graphs/contributors 

Still on beta, playoffs might not work etc..

## Examples

![](.github/example_liiga.png)

## Dependencies

* An installation of [MagicMirror²](https://github.com/MichMich/MagicMirror)
* npm
* [node-fetch](https://www.npmjs.com/package/node-fetch)

## Installation

* Clone this repo into `~/MagicMirror/modules` directory.
* Configure your `~/MagicMirror/config/config.js`:

```js
{
    module: 'MMM-Liiga',
    position: 'top_right',
    config: {
        // Add your config options here, which have a different value than default.
    }
}
```

* Run command `npm i --production` in `~/MagicMirror/modules/MMM-Liiga` directory.

## Config Options

| **Option** | **Default** | **Description** |
| --- | --- | --- |
| `colored` | `false` | Remove black/white filter of logos. |
| `focus_on` | `false` | Display only matches with teams of this array e.g. `['VAN', 'MTL', 'BOS']`. |
| `matches` | `6` | Max number of matches displaying simultaneously. |
| `rotateInterval` | `20000` (20 secs) | How often should be rotated the matches in the list. |
| `reloadInterval` | `1800000` (30 mins) | How often should the data be fetched. |
| `daysInPast` | `1` | How many days should a game be displayed after it is finished. |
| `daysAhead` | `7` | How many days should a game be displayed before it starts. |
| `liveReloadInterval` | `60000 (1 min)` | How often should the data be fetched during a live game. |
| `showNames` | `true` | Should team names be displayed? |
| `showLogos` | `true` | Should team logos be displayed? |
| `showPlayoffSeries` | `true` | Should playoff series be displayed (if in playoffs)? |
| `rollOver` | `false` | Displays today's games and based on game status also yesterdays games or tomorrows games. Automatically overrides `daysInPast` and `daysAhead` to 1. |

## Global config

| **Option** | **Default** | **Description** |
| --- | --- | --- |
| `locale` | `undefined` | By default it is using your system settings. You can specify the locale in the global MagicMirror² config. Possible values are for e.g.: `'en-US'` or `'de-DE'`. |

To set a global config you have top set the value in your config.js file inside the MagicMirror² project.

![](.github/global.png)

## Developer

* `npm run lint` - Lints JS and CSS files.
* `npm run docs` - Generates documentation.
