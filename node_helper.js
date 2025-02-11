/**
 * @file node_helper.js
 *
 * @author fewieden
 * @license MIT
 *
 * @see  https://github.com/fewieden/MMM-NHL
 */

/* eslint-env node */

/**
 * @external node-fetch
 * @see https://www.npmjs.com/package/node-fetch
 */
const fetch = require('node-fetch');

/**
 * @external logger
 * @see https://github.com/MichMich/MagicMirror/blob/master/js/logger.js
 */
const Log = require('logger');

/**
 * @external node_helper
 * @see https://github.com/MichMich/MagicMirror/blob/master/js/node_helper.js
 */
const NodeHelper = require('node_helper');

const BASE_PLAYOFF_URL = 'https://statsapi.web.nhl.com/api/v1/tournaments/playoffs?expand=round.series';

/**
 * Derived team details of a game from API endpoint for easier usage.
 *
 * @typedef {object} Team
 * @property {number} id - Team identifier.
 * @property {string} abbrev - 3 letter team name.
 * @property {number} score - Current score of the team.
 */

/**
 * Derived game details from API endpoint for easier usage.
 *
 * @typedef {object} Game
 * @property {number} id - Game identifier.
 * @property {string} timestamp - Start date of the game in UTC timezone.
 * @property {string} gameDay - Game day in format YYYY-MM-DD in north american timezone.
 * @property {string} gameState - Contains information about the game status, e.g. OFF, LIVE, CRIT, FUT.
 * @property {Team} awayTeam - Contains information about the away team.
 * @property {Team} homeTeam - Contains information about the home team.
 * @property {object} periodDescriptor - Contains information about the period of play of the game. Is present on all games, past, present, and future.
 * @property {number} periodDescriptor.number - Period of the game e.g. 1, 2, 3, 4.
 * @property {string} periodDescriptor.periodType - Abbreviated description of the period type, e.g. REG, OT.
 */

/**
 * Derived game details from API endpoint for easier usage.
 *
 * @typedef {object} Series
 * @property {number} gameNumberOfSeries - Game identifier.
 * @property {number} round - Playoff round number, e.g. 1, 2, 3, 4.
 * @property {string} roundAbbrev - Abbreviation of round type, e.g. SCF
 * @property {number} topSeedTeamId - Contains the ID of the top-seeded team.
 * @property {number} topSeedWins - Contains the number of wins of the top-seeded team in this round.
 * @property {number} bottomSeedTeamId - Contains the ID of the bottom-seeded team.
 * @property {number} bottomSeedWins - Contains the number of wins of the bottom-seed team in this round.
 */

/**
 * Derived season details from API endpoint for easier usage.
 *
 * @typedef {object} SeasonDetails
 * @property {string} year - Year of the season in format yy/yy e.g. 20/21.
 * @property {number} mode - Mode of the season e.g. 0, 1 and 2.
 */

/**
 * @module node_helper
 * @description Backend for the module to query data from the API provider.
 *
 * @requires external:node-fetch
 * @requires external:logger
 * @requires external:node_helper
 */
module.exports = NodeHelper.create({
    /** @member {string} requiresVersion - Defines the minimum version of MagicMirror² to run this node_helper. */
    requiresVersion: '2.15.0',
    /** @member {?Game} nextGame - The next upcoming game is stored in this variable. */
    nextGame: null,
    /** @member {Game[]} liveGames - List of all ongoing games. */
    liveGames: [],
    /** @member {Game[]} liveStates - List of all live game states. */
    liveStates: ['LIVE', 'CRIT'],

    /**
     * @function socketNotificationReceived
     * @description Receives socket notifications from the module.
     * @async
     * @override
     *
     * @param {string} notification - Notification name
     * @param {*} payload - Detailed payload of the notification.
     *
     * @returns {void}
     */
    async socketNotificationReceived(notification, payload) {
        if (notification === 'CONFIG') {
            this.config = payload.config;

            await this.initTeams();

            await this.updateSchedule();
            setInterval(() => this.updateSchedule(), this.config.reloadInterval);
            setInterval(() => this.fetchOnLiveState(), this.config.liveReloadInterval);
        }
    },

    /**
     * @function initTeams
     * @description Retrieves a list of all teams from the API and initializes teamMapping.
     * @async
     *
     * @returns {void}
     */
    async initTeams() {
        if (this.teamMapping) {
            return;
        }

        const response = await fetch(`https://liiga.fi/api/v2/teams/info`);

        if (!response.ok) {
            Log.error(`Initializing NHL teams failed: ${response.status} ${response.statusText}`);

            return;
        }

        const infoData = await response.json();

        this.teamMapping = Object.keys(infoData.teams)
            .map((teamKey) => infoData.teams[teamKey])
            .reduce((mapping, team) => {
                mapping[`${team.id}:${team.name.toLowerCase()}`] = {
                    name: team.name,
                    short: team.short_name,
                    logo: team.logo,
                };
                return mapping;
        }, {});
    },

    /**
     * @function getScheduleDates
     * @description Helper function to retrieve dates in the past and future based on config options.
     * @async
     *
     * @returns {object} Dates in the past and future.
     */
    getScheduleDates() {
        const start = new Date();
        start.setDate(start.getDate() - this.config.daysInPast);

        const end = new Date();
        end.setDate(end.getDate() + this.config.daysAhead + 1);
        end.setHours(0);
        end.setMinutes(0);
        end.setSeconds(0);

        const today = new Date();

        return {
            startUtc: start.toISOString(),
            startFormatted: new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki' }).format(start),
            endUtc: end.toISOString(),
            endFormatted: new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki' }).format(end),
            todayUtc: today.toISOString(),
            todayFormatted: new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki' }).format(today)
        };
    },

    /**
     * @function getRemainingGameTime
     * @description Helper function to retrieve remaining game time.
     * @async
     *
     * @returns {string?} Remaining game time.
     */
    getRemainingGameTime(game, scores) {
        if (!this.liveStates.includes(game.gameState)) {
            return;
        }

        const score = scores.find(score => score.id === game.id);
        if (!score) {
            return;
        }

        return score?.clock?.inIntermission ? '00:00' : score?.clock?.timeRemaining;
    },

    /**
     * @function hydrateRemainingTime
     * @description Hydrates remaining time on the games in the schedule from the scores API endpoint.
     * @async
     *
     * @returns {object[]} Raw games from API endpoint including remaining time.
     */
    async hydrateRemainingTime(schedule) {
        const { todayFormatted } = this.getScheduleDates();
        const scoresUrl = `https://api-web.nhle.com/v1/score/${todayFormatted}`;
        const scoresResponse = await fetch(scoresUrl);
        if (!scoresResponse.ok) {
            Log.error(`Fetching NHL scores failed: ${scoresResponse.status} ${scoresResponse.statusText}. Url: ${scoresUrl}`);

            return schedule;
        }

        const { games } = await scoresResponse.json();

        for (const game of schedule) {
            game.timeRemaining = this.getRemainingGameTime(game, games);
        }

        return schedule;
    },

    /**
     * @function formatLiigaGameState
     * @description Helper function parse Liiga game data into compatible format for the app
     *
     * @returns {object} game state
     */
    formatLiigaGameState(game) {
        if (game.finishedType === 'ACTIVE_OR_NOT_STARTED') {
            if (game.started) {
                if (game.ended) {
                    return 'OFF';
                }
                return 'LIVE';
            }
            return game.gameTime === 0 ? 'PRE' : 'FUT';
        }
        return 'OFF';
    },

    /**
     * @function formatLiigaPeriod
     * @description Helper function parse Liiga game data into compatible format for the app
     *
     * @returns {object} game periodDescriptor
     */
    formatLiigaPeriod(game) {
        if (game.finishedType === 'ACTIVE_OR_NOT_STARTED') {
            const curPer = game?.periods?.find((pd) => pd.startTime <= game.gameTime && game.gameTime <= pd.endTime);

            function fmtMSS() {
                let s = game.gameTime - curPer?.startTime;
                return (s - (s%=60)) / 60 + (9 < s ? ':' : ':0') + s;
            }

            return curPer ? {
                number: curPer.index,
                periodTime: fmtMSS(),
                periodType: "REG"
            } : {};
        } else if (game.finishedType === 'ENDED_DURING_REGULAR_GAME_TIME') {
            return {periodType: "REG", number: 3};
        } else if (game.finishedType === 'ENDED_DURING_EXTENDED_GAME_TIME') {
            return {periodType: "OT"};
        } else if (game.finishedType === 'ENDED_DURING_WINNING_SHOT_COMPETITION') {
            return {periodType: "SO"};
        }
    },

    /**
     * @function formatLiigaGame
     * @description Helper function parse Liiga game data into compatible format for the app
     *
     * @returns {object} game data
     */
    formatLiigaGame(game) {
        const periodDesc = this.formatLiigaPeriod(game);

        const formattedGame = {
            //...game,
            gameDay: game.start.split('T')[0],
            season: game.season,
            periodDescriptor: periodDesc,
            timeRemaining: periodDesc.periodTime,
            gameState: this.formatLiigaGameState(game),
            startTimeUTC: game.start,
            awayTeam: {
                id: game.awayTeam.teamId,
                score: game.awayTeam.goals,
            },
            homeTeam: {
                id: game.homeTeam.teamId,
                score: game.homeTeam.goals,
            },
            gameType: game.serie === 'RUNKOSARJA' ? '2' : '3',
        };

        return formattedGame;
    },


    /**
     * @function fetchSchedule
     * @description Retrieves a list of games from the API with timespan based on config options.
     * @async
     *
     * @returns {object[]} Raw games from API endpoint.
     */
    async fetchSchedule() {
        const { startUtc, endUtc } = this.getScheduleDates();

        const seasonYear = new Date().getUTCFullYear() - (new Date().getMonth() > 6 ? 1 : 0);
        const scheduleUrl = `https://liiga.fi/api/v2/games?tournament=runkosarja&season=${seasonYear}`;

        const scheduleResponse = await fetch(scheduleUrl);

        if (!scheduleResponse.ok) {
            Log.error(`Fetching NHL schedule failed: ${scheduleResponse.status} ${scheduleResponse.statusText}. Url: ${scheduleUrl}`);
            return;
        }

        const games = await scheduleResponse.json();

        const schedule = games
                .map(game => this.formatLiigaGame(game))
                .filter(game => game.startTimeUTC > startUtc && game.startTimeUTC < endUtc);

        /*
        Log.info('xxx schedule', JSON.stringify(
            schedule.filter((g) => g.gameDay === '2024-02-10'),
            null, 2)
        );
        */

        return schedule;
    },

    /**
     * @function fetchPlayoffs
     * @description Retrieves playoff data from the API.
     * @async
     *
     * @returns {object} Raw playoff data from API endpoint.
     */
    async fetchPlayoffs() {

        const scheduleUrl =
            `https://liiga.fi/api/v2/games?tournament=playoffs&season=${new Date().getUTCFullYear()}`;


        // TODO: Find playoff endpoints in new API
        const response = await fetch(BASE_PLAYOFF_URL);

        if (!response.ok) {
            Log.error(`Fetching NHL playoffs failed: ${response.status} ${response.statusText}.`);
            return;
        }

        const playoffs = await response.json();
        playoffs.rounds.sort((a, b) => a.number <= b.number ? 1 : -1);

        return playoffs;
    },

    /**
     * @function filterGameByFocus
     * @description Helper function to filter games based on config option.
     *
     * @param {object} game - Raw game information.
     *
     * @returns {boolean} Should game remain in list?
     */
    filterGameByFocus(game) {
        const focus = this.config.focus_on;
        if (!focus) {
            return true;
        }

        const homeTeam = this.teamMapping[game.homeTeam.id].short;
        const awayTeam = this.teamMapping[game.awayTeam.id].short;

        return focus.includes(homeTeam) || focus.includes(awayTeam);
    },

    /**
     * @function filterRollOverGames
     * @description Helper function to filter games based on rollOver config option.
     *
     * @param {Game[]} games - List of all games.
     *
     * @returns {Game[]} List of filtered games.
     */
    filterRollOverGames(games) {
        if (!this.config.rollOver) {
            return games;
        }

        const date = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki' })
            .format(new Date());

        const yesterday = games.filter(game => game.gameDay < date);
        const today = games.filter(game => game.gameDay === date);
        const tomorrow = games.filter(game => game.gameDay > date);

        const ongoingStates = ['OFF', 'CRIT', 'LIVE'];

        if (today.some(game => ongoingStates.includes(game.status))) {
            return [...today, ...tomorrow];
        }

        return [...yesterday, ...today];
    },

    /**
     * @function computeSeasonDetails
     * @description Computes current season details (year and mode) from list of games.
     *
     * @param {object[]} schedule - List of raw games from API endpoint.
     *
     * @returns {SeasonDetails} Current season details.
     */
    computeSeasonDetails(schedule) {
        const game = schedule.find(game => game.gameState !== 'OFF') || schedule[schedule.length - 1];

        const yrs = [game.season.toString().slice(-2)];
        const [yrsAdd, yrDelta] = new Date().getMonth() > 6 ?
            [(e) => yrs.push(e), 1] :
            [(e) => yrs.unshift(e), -1];
        yrsAdd((game.season + yrDelta).toString().slice(-2));

        if (game) {
            return {
                year: yrs.join('-'),
                mode: game.gameType
            };
        }

        const year = new Date().getFullYear();
        const currentYear = year.toString().slice(-2);
        const nextYear = (year + 1).toString().slice(-2);

        return {
            year: `${currentYear}-${nextYear}`,
            mode: 1
        };
    },

    /**
     * @function computePlayoffDetails
     * @description Computes current playoff details from list of series.
     *
     * @param {object} playoffData - List of raw series from API endpoint.
     *
     * @returns {Series[]} Current season details.
     */
    computePlayoffDetails(playoffData) {
        if (!playoffData || !playoffData.rounds) {
            return [];
        }

        const series = [];
        playoffData.rounds.forEach(r => {
            r.series.forEach(s => {
                const parsed = this.parseSeries(s);
                if (parsed) {
                    series.push(parsed);
                }
            });
        });

        return series;
    },

    /**
     * @function parseTeam
     * @description Transforms raw team information for easier usage.
     *
     * @param {object} team - Team in raw format.
     *
     * @returns {Team} Parsed team information.
     */
    parseTeam(team) {
        if (!team) {
            Log.error('no team given');
            return {};
        }

        return {
            id: team.id,
            name: this.teamMapping[team.id]?.name || '-',
            short: this.teamMapping[team.id]?.short || '-',
            logoUrl: this.teamMapping[team.id].logo,
            score: team.score ?? 0
        };
    },

    /**
     * @function parsePlayoffTeam
     * @description Transforms raw game information for easier usage.
     *
     * @param {object} rawTeam - Raw team information.
     *
     * @param {object} game - Raw game information.
     *
     * @returns {Game} Parsed game information.
     */
    parsePlayoffTeam(rawTeam, game) {
        const team = this.parseTeam(rawTeam);

        if (game?.seriesStatus?.topSeedTeamId === team.id) {
            team.score = game?.seriesStatus?.topSeedWins;
        } else {
            team.score = game?.seriesStatus?.bottomSeedWins;
        }

        return team;
    },

    /**
     * @function parseGame
     * @description Transforms raw game information for easier usage.
     *
     * @param {object} game - Raw game information.
     *
     * @returns {Game} Parsed game information.
     */
    parseGame(game = {}) {
        return {
            id: game.id,
            timestamp: game.startTimeUTC,
            gameDay: game.gameDay,
            status: game.gameState,
            teams: {
                away: this.parseTeam(game.awayTeam),
                home: this.parseTeam(game.homeTeam),
            },
            live: {
                period: this.getNumberWithOrdinal(game.periodDescriptor.number),
                periodType: game.periodDescriptor.periodType,
                timeRemaining: game.timeRemaining,
            }
        };
    },

    /**
     * @function getNumberWithOrdinal
     * @description Converts a raw number into a number with appropriate English ordinal suffix.
     *
     * @param {number} n - The number to apply an ordinal suffix to.
     *
     * @returns {string} The given number with its ordinal suffix appended.
     */
    getNumberWithOrdinal(n) {
        // TODO: This function seems over complicated, don't we just have 1st 2nd and 3rd?
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;

        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },

    /**
     * @function parseSeries
     * @description Transforms raw series information for easier usage.
     *
     * @param {object} series - Raw series information.
     *
     * @returns {Series} Parsed series information.
     */
    parseSeries(series = {}) {
        if (!series.matchupTeams || series.matchupTeams.length === 0) {
            return null;
        }

        return {
            number: series.number,
            round: series.round.number,
            teams: {
                home: this.parsePlayoffTeam(series.matchupTeams, undefined), // TODO: Don't pass undefined to retrieve the correct score
                away: this.parsePlayoffTeam(series.matchupTeams, undefined), // TODO: Don't pass undefined to retrieve the correct score
            }
        }
    },

    /**
     * @function setNextandLiveGames
     * @description Sets the next scheduled and live games from a list of games.
     *
     * @param {Game[]} games - List of games.
     *
     * @returns {void}
     */
    setNextandLiveGames(games) {
        this.nextGame = games.find(game => game.status === 'FUT');
        this.liveGames = games.filter(game => this.liveStates.includes(game.status));
    },

    /**
     * @function sortGamesByTimestampAndID
     * @description Helper function to sort games by timestamp and ID.
     *
     * @param {object} game1 - Raw game information of first game.
     * @param {object} game2 - Raw game information of second game.
     *
     * @returns {number} Should game be before or after in the list?
     */
    sortGamesByTimestampAndID(game1, game2) {
        if (game1.startTimeUTC === game2.startTimeUTC) {
            return game1.id > game2.id ? 1 : -1;
        }

        return game1.startTimeUTC > game2.startTimeUTC ? 1 : -1;
    },

    /**
     * @function updateSchedule
     * @description Retrieves new schedule from API and sends a socket notification to the module.
     * @async
     *
     * @returns {void}
     */
    async updateSchedule() {
        const schedule = await this.fetchSchedule();
        schedule.sort(this.sortGamesByTimestampAndID);
        const season = this.computeSeasonDetails(schedule);

        const focusSchedule = schedule.filter(this.filterGameByFocus.bind(this));

        const games = focusSchedule.map(this.parseGame.bind(this));

        const rollOverGames = this.filterRollOverGames(games);

        this.setNextandLiveGames(rollOverGames);
        this.sendSocketNotification('SCHEDULE', { games: rollOverGames, season });

        if (season.mode === 3 || games.length === 0) {

            const playoffData = await this.fetchPlayoffs();
            const playoffSeries = this.computePlayoffDetails(playoffData).filter(s => s.round >= playoffData.defaultRound);

            this.sendSocketNotification('PLAYOFFS', playoffSeries);
        }
    },

    /**
     * @function fetchOnLiveState
     * @description If there is a live game trigger updateSchedule.
     * @async
     *
     * @returns {void}
     */
    fetchOnLiveState() {
        const hasLiveGames = this.liveGames.length > 0;
        const gameAboutToStart = this.nextGame && new Date().toISOString() > this.nextGame.timestamp;

        if (hasLiveGames || gameAboutToStart) {
            return this.updateSchedule();
        }
    }
});
