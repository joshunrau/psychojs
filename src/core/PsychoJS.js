/** @module core */
/**
 * Main component of the PsychoJS library.
 *
 * @author Alain Pitiot
 * @copyright (c) 2017-2020 Ilixa Ltd. (http://ilixa.com) (c) 2020-2024 Open Science Tools Ltd. (https://opensciencetools.org)
 * @license Distributed under the terms of the MIT License
 */

import log4javascript from "log4javascript";

import { ExperimentHandler } from "../data/ExperimentHandler.js";
import { Shelf } from "../data/Shelf";
import { MonotonicClock } from "../util/Clock.js";
import { Scheduler } from "../util/Scheduler.js";
import * as util from "../util/Util.js";
import { EventManager } from "./EventManager.js";
import { GUI } from "./GUI.js";
import { Logger } from "./Logger.js";
import { ServerManager } from "./ServerManager.js";
import { Window } from "./Window.js";

/**
 * <p>PsychoJS initialises the library and its various components (e.g. the [ServerManager]{@link module:core.ServerManager}, the [EventManager]{@link module:core.EventManager}), and manages
 * the lifecycle of an experiment.</p>
 */
export class PsychoJS {
  /**
   * @param {Object} options - options
   * @param {boolean} [options.debug= true] - whether to log debug information in the browser console
   * @param {boolean} [options.collectIP= false] - whether to collect the IP information of the participant
   */
  constructor({
    autoStartScheduler = true,
    captureErrors = true,
    checkWebGLSupport = false,
    collectIP = false,
    debug = true,
    hosts = [],
    saveResults = true,
    topLevelStatus = true,
  } = {}) {
    // logging:
    this._logger = new Logger(
      this,
      debug ? log4javascript.Level.DEBUG : log4javascript.Level.INFO,
    );
    if (captureErrors) {
      this._captureErrors();
    }

    // detect the browser:
    this._browser = util.detectBrowser();
    this.logger.info("[PsychoJS] Detected browser:", this._browser);

    // core clock:
    this._monotonicClock = new MonotonicClock();

    // managers:
    this._eventManager = new EventManager(this);
    this._serverManager = new ServerManager({
      psychoJS: this,
    });

    // add the pavlovia server to the list of hosts:
    const pavloviaHosts = new Set([
      "https://devlovia.org/run/",
      "https://pavlovia.org/run/",
      "https://run.devlovia.org/",
      "https://run.pavlovia.org/",
      ...hosts,
    ]);
    this._hosts = Array.from(pavloviaHosts);

    // GUI:
    this._gui = new GUI(this);

    // IP:
    this._collectIP = collectIP;

    // main scheduler:
    this._scheduler = new Scheduler(this);

    // Window:
    this._window = undefined;

    // Shelf:
    this._shelf = new Shelf({ psychoJS: this });

    // redirection URLs:
    this._cancellationUrl = undefined;
    this._completionUrl = undefined;

    // survey id, if applicable:
    this._surveyId = undefined;

    // status:
    this.status = PsychoJS.Status.NOT_CONFIGURED;

    // make the PsychoJS.Status accessible from the top level of the generated experiment script
    // in order to accommodate PsychoPy's Code Components
    if (topLevelStatus) {
      this._makeStatusTopLevel();
    }

    // whether to start the scheduler when the experiment starts:
    this._autoStartScheduler = autoStartScheduler;

    // whether to check for actual hardware accelerated WebGL support:
    this._checkWebGLSupport = checkWebGLSupport;

    // whether to save results at the end of the experiment:
    this._saveResults = saveResults;

    this.logger.info("[PsychoJS] Version 2024.2.0");
    this.logger.info("[PsychoJS] Initialised.");

    // hide the initialisation message:
    const root = document.getElementById("root");
    root.classList.add("is-ready");
  }

  get browser() {
    return this._browser;
  }

  get config() {
    return this._config;
  }

  get eventManager() {
    return this._eventManager;
  }

  get experiment() {
    return this._experiment;
  }

  get experimentLogger() {
    return this._logger;
  }

  get gui() {
    return this._gui;
  }

  get IP() {
    return this._IP;
  }

  get logger() {
    return this._logger.consoleLogger;
  }

  get monotonicClock() {
    return this._monotonicClock;
  }

  get scheduler() {
    return this._scheduler;
  }

  get serverManager() {
    return this._serverManager;
  }

  // this._serverMsg is a bi-directional message board for communications with the pavlovia.org server:
  get serverMsg() {
    return this._serverMsg;
  }

  get shelf() {
    return this._shelf;
  }

  get status() {
    return this._status;
  }

  set status(status) {
    this._status = status;
  }

  get window() {
    return this._window;
  }

  /**
   * Capture all errors and display them in a pop-up error box.
   * @protected
   */
  _captureErrors() {
    this.logger.debug(
      "capturing all errors and showing them in a pop up window",
    );

    const self = this;
    window.onerror = function (message, source, lineno, colno, error) {
      // check for ResizeObserver loop limit exceeded error:
      // ref: https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded
      if (
        message === "ResizeObserver loop limit exceeded" ||
        message ===
          "ResizeObserver loop completed with undelivered notifications."
      ) {
        console.warn(message);
        return true;
      }

      console.error(error);

      document.body.setAttribute(
        "data-error",
        JSON.stringify({
          colno: colno,
          error: error,
          lineno: lineno,
          message: message,
          source: source,
        }),
      );

      if (error !== null) {
        self._gui.dialog({ error: error });
      } else {
        self._gui.dialog({ error: message });
      }

      return true;
    };
    window.onunhandledrejection = function (error) {
      console.error(error?.reason);
      if (error?.reason?.stack === undefined) {
        // No stack? Error thrown by PsychoJS: stringify whole error
        document.body.setAttribute("data-error", JSON.stringify(error?.reason));
      } else {
        // Yes stack? Error thrown by JS: stringify stack
        document.body.setAttribute(
          "data-error",
          JSON.stringify(error?.reason?.stack),
        );
      }
      self._gui.dialog({ error: error?.reason });
      return true;
    };
  }

  /**
   * Configure PsychoJS for the running experiment.
   *
   * @protected
   * @param {string} configURL - the URL of the configuration file
   * @param {string} name - the name of the experiment
   * @return {void}
   */
  async _configure(configURL, name) {
    const response = {
      context: "when configuring PsychoJS for the experiment",
      origin: "PsychoJS.configure",
    };

    try {
      this.status = PsychoJS.Status.CONFIGURING;

      // if the experiment is running from an approved host, e.g pavlovia.org,
      // we read the configuration file:
      const experimentUrl = window.location.href;
      const isHost = this._hosts.some(
        (url) => experimentUrl.indexOf(url) === 0,
      );
      if (isHost) {
        const serverResponse =
          await this._serverManager.getConfiguration(configURL);
        this._config = serverResponse.config;

        // update the configuration for legacy experiments, which had a psychoJsManager
        // block instead of a pavlovia block, with URL pointing to https://pavlovia.org/server
        if ("psychoJsManager" in this._config) {
          delete this._config.psychoJsManager;
          this._config.pavlovia = {
            URL: "https://pavlovia.org",
          };
        }

        // tests for the presence of essential blocks in the configuration:
        if (!("experiment" in this._config)) {
          throw "missing experiment block in configuration";
        }
        if (!("name" in this._config.experiment)) {
          throw "missing name in experiment block in configuration";
        }
        if (!("fullpath" in this._config.experiment)) {
          throw "missing fullpath in experiment block in configuration";
        }
        if (!("pavlovia" in this._config)) {
          throw "missing pavlovia block in configuration";
        }
        if (!("URL" in this._config.pavlovia)) {
          throw "missing URL in pavlovia block in configuration";
        }
        if (!("gitlab" in this._config)) {
          throw "missing gitlab block in configuration";
        }
        if (!("projectId" in this._config.gitlab)) {
          throw "missing projectId in gitlab block in configuration";
        }

        this._config.environment = ExperimentHandler.Environment.SERVER;
      }
      // otherwise, we create an ad-hoc configuration:
      else {
        this._config = {
          environment: ExperimentHandler.Environment.LOCAL,
          experiment: {
            keys: [],
            name,
            saveFormat: ExperimentHandler.SaveFormat.CSV,
            saveIncompleteResults: true,
          },
        };
      }
      // init the partial results upload options
      this._config.experiment.resultsUpload = {
        intervalId: -1,
        period: -1,
      };

      // get the server parameters (those starting with a double underscore):
      this._serverMsg = new Map();
      util.getUrlParameters().forEach((value, key) => {
        if (key.indexOf("__") === 0) {
          this._serverMsg.set(key, value);
        }
      });

      // note: __noOutput is typically used for automated testing
      if (this._serverMsg.has("__noOutput")) {
        this._saveResults = false;
      }

      this.status = PsychoJS.Status.CONFIGURED;
      this.logger.debug("configuration:", util.toString(this._config));
    } catch (error) {
      // throw { ...response, error };
      throw Object.assign(response, { error });
    }
  }

  /**
   * Get the IP information of the participant, asynchronously.
   *
   * Note: we use [http://www.geoplugin.net/json.gp]{@link http://www.geoplugin.net/json.gp}.
   * @protected
   * @return {void}
   */
  async _getParticipantIPInfo() {
    const response = {
      context: "when getting the IP information of the participant",
      origin: "PsychoJS._getParticipantIPInfo",
    };

    this.logger.debug("getting the IP information of the participant");

    this._IP = {};
    try {
      const url = "http://www.geoplugin.net/json.gp";
      const getResponse = await fetch(url, {
        cache: "no-cache",
        credentials: "same-origin",
        method: "GET",
        mode: "cors",
        redirect: "follow",
        referrerPolicy: "no-referrer",
      });
      if (getResponse.status !== 200) {
        throw `unable to obtain the IP of the participant: ${response.statusText}`;
      }
      const geoData = await getResponse.json();

      this._IP = {
        country: geoData.geoplugin_countryName,
        IP: geoData.geoplugin_request,
        latitude: geoData.geoplugin_latitude,
        longitude: geoData.geoplugin_longitude,
      };
      this.logger.debug(
        "IP information of the participant:",
        util.toString(this._IP),
      );
    } catch (error) {
      // throw { ...response, error };
      throw Object.assign(response, { error });
    }
  }

  /**
   * Make the various Status top level, in order to accommodate PsychoPy's Code Components.
   * @protected
   */
  _makeStatusTopLevel() {
    for (const status in PsychoJS.Status) {
      window[status] = PsychoJS.Status[status];
    }
  }

  /**
   * Get the experiment's environment.
   *
   * @returns {ExperimentHandler.Environment | undefined} the environment of the experiment, or undefined
   */
  getEnvironment() {
    if (typeof this._config === "undefined") {
      return undefined;
    }
    return this._config.environment;
  }

  /**
   * Make the attributes of the given object those of window, such that they become global.
   *
   * @param {Object.<string, *>} obj the object whose attributes are to become global
   */
  importAttributes(obj) {
    this.logger.debug("import attributes from: ", util.toString(obj));

    if (typeof obj === "undefined") {
      return;
    }

    for (const attribute in obj) {
      window[attribute] = obj[attribute];
    }
  }

  /**
   * Open a PsychoJS Window.
   *
   * This opens a PIXI canvas.
   * Note: we can only open one window.
   *
   * @param {Object} options
   * @param {string} [options.name] the name of the window
   * @param {boolean} [options.fullscr] whether or not to go fullscreen
   * @param {Color} [options.color] the background color of the window
   * @param {string} [options.units] the units of the window
   * @param {boolean} [options.autoLog] whether or not to log
   * @param {boolean} [options.waitBlanking] whether or not to wait for all rendering operations to be done
   * before flipping
   * @throws {Object.<string, *>} exception if a window has already been opened
   */
  openWindow({
    autoLog,
    color,
    fullscr,
    gamma,
    name,
    units,
    waitBlanking,
  } = {}) {
    this.logger.info("[PsychoJS] Open Window.");

    if (typeof this._window !== "undefined") {
      throw {
        context: "when opening a Window",
        error: "A Window has already been opened.",
        origin: "PsychoJS.openWindow",
      };
    }

    this._window = new Window({
      autoLog,
      color,
      fullscr,
      gamma,
      name,
      psychoJS: this,
      units,
      waitBlanking,
    });
  }

  /**
   * Close everything and exit nicely at the end of the experiment,
   * potentially redirecting to one of the URLs previously specified by setRedirectUrls.
   *
   * <p>Note: if the resource manager is busy, we inform the participant
   * that he or she needs to wait for a bit.</p>
   *
   * @param {Object} options - options
   * @param {string} [options.message] - optional message to be displayed in a dialog box before quitting
   * @param {boolean} [options.isCompleted = false] - whether the participant has completed the experiment
   * @return {void}
   */
  async quit({
    closeWindow = true,
    isCompleted = false,
    message,
    showOK = true,
  } = {}) {
    this.logger.info("[PsychoJS] Quit.");

    const response = {
      context: "when terminating the experiment",
      origin: "PsychoJS.quit",
    };

    this._experiment.experimentEnded = true;
    this._experiment.isCompleted = isCompleted;
    this.status = PsychoJS.Status.STOPPED;
    const isServerEnv =
      this.getEnvironment() === ExperimentHandler.Environment.SERVER;

    try {
      // stop the main scheduler:
      this._scheduler.stop();

      // remove the beforeunload listener:
      if (isServerEnv) {
        window.removeEventListener("beforeunload", this.beforeunloadCallback);
      }

      // stop the regular uploading of results, if need be:
      if (this._config.experiment.resultsUpload.intervalId > 0) {
        clearInterval(this._config.experiment.resultsUpload.intervalId);
        this._config.experiment.resultsUpload.intervalId = -1;
      }
      delete this._config.experiment.resultsUpload.lastUploadTimestamp;

      // save the results and the logs of the experiment:
      this.gui.finishDialog({
        nbSteps: (this._saveResults ? 2 : 0) + (isServerEnv ? 1 : 0),
        text: "Terminating the experiment. Please wait a few moments...",
      });

      if (isCompleted || this._config.experiment.saveIncompleteResults) {
        if (this._saveResults) {
          this.gui.finishDialogNextStep("saving results");
          await this._experiment.save();
          this.gui.finishDialogNextStep("saving logs");
          await this._logger.flush();
        }
      }

      // close the session:
      if (isServerEnv) {
        this.gui.finishDialogNextStep("closing the session");
        await this._serverManager.closeSession(isCompleted);
      }

      // thank participant for waiting, and either quit or redirect:
      const onTerminate = () => {
        if (closeWindow) {
          // close the window:
          this._window.close();

          // remove everything from the browser window:
          while (document.body.hasChildNodes()) {
            document.body.removeChild(document.body.lastChild);
          }
        }

        // return from fullscreen if we were there:
        this._window.closeFullScreen();

        this.status = PsychoJS.Status.FINISHED;

        // redirect if redirection URLs have been provided:
        if (isCompleted && typeof this._completionUrl !== "undefined") {
          window.location = this._completionUrl;
        } else if (
          !isCompleted &&
          typeof this._cancellationUrl !== "undefined"
        ) {
          window.location = this._cancellationUrl;
        }
      };

      if (showOK) {
        const defaultMsg = "Thank you for your patience. Goodbye!";
        const text = typeof message !== "undefined" ? message : defaultMsg;
        this._gui.dialog({
          message: text,
          onOK: onTerminate,
        });
      } else {
        this._gui.closeDialog();
        onTerminate();
      }
    } catch (error) {
      this.status = PsychoJS.Status.ERROR;
      throw { ...response, error };
      // this._gui.dialog({ error: { ...response, error } });
    }
  }

  /**
   * Schedule a task.
   *
   * @param {module:util.Scheduler~Task} task - the task to be scheduled
   * @param {*} [args] - arguments for that task
   */
  schedule(task, args) {
    this.logger.debug(
      "schedule task: ",
      task.toString().substring(0, 50),
      "...",
    );

    this._scheduler.add(task, args);
  }

  /**
   * @callback PsychoJS.condition
   * @return {boolean} true if the thenScheduler is to be run, false if the elseScheduler is to be run
   */
  /**
   * Schedule a series of task based on a condition.
   *
   * @param {PsychoJS.condition} condition
   * @param {Scheduler} thenScheduler - scheduler to run if the condition is true
   * @param {Scheduler} elseScheduler - scheduler to run if the condition is false
   */
  scheduleCondition(condition, thenScheduler, elseScheduler) {
    this.logger.debug(
      "schedule condition: ",
      condition.toString().substring(0, 50),
      "...",
    );

    this._scheduler.addConditional(condition, thenScheduler, elseScheduler);
  }

  /**
   * Set the completion and cancellation URL to which the participant will be redirect at the end of the experiment.
   *
   * @param {string} completionUrl  - the completion URL
   * @param {string} cancellationUrl - the cancellation URL
   */
  setRedirectUrls(completionUrl, cancellationUrl) {
    this._completionUrl = completionUrl;
    this._cancellationUrl = cancellationUrl;
  }

  /**
   * Start the experiment.
   *
   * <p>The resources are specified in the following fashion:
   * <ul>
   *   <li>For an experiment running locally: the root directory for the specified resources is that of index.html
   *   unless they are prepended with a protocol, such as http:// or https://.</li>
   *   <li>For an experiment running on the server: if no resources are specified, all files in the resources directory
   *   of the experiment are downloaded, otherwise we only download the specified resources. All resources are assumed
   *   local to index.html unless they are prepended with a protocol.</li>
   *   <li>If resources is null: we do not download any resources.</li>
   * </ul>
   * </p>
   *
   * @param {Object} options
   * @param {string} [options.configURL=config.json] - the URL of the configuration file
   * @param {string} [options.expName=UNKNOWN] - the name of the experiment
   * @param {Object.<string, *>} [options.expInfo] - additional information about the experiment
   * @param {Array.<{name: string, path: string}>} [resources=[]] - the list of resources
   */
  async start({
    configURL = "config.json",
    dataFileName,
    expInfo = {},
    expName = "UNKNOWN",
    resources = [],
    surveyId,
  } = {}) {
    this.logger.debug();

    const response = {
      context: "when starting the experiment",
      origin: "PsychoJS.start",
    };

    try {
      // configure the experiment:
      await this._configure(configURL, expName);

      // get the participant IP:
      if (this._collectIP) {
        this._getParticipantIPInfo();
      } else {
        this._IP = {
          city: "X",
          country: "X",
          hostname: "X",
          IP: "X",
          location: "X",
          region: "X",
        };
      }

      // setup the experiment handler:
      this._experiment = new ExperimentHandler({
        dataFileName,
        extraInfo: expInfo,
        psychoJS: this,
      });

      // setup the logger:
      // my.logger.console.setLevel(psychoJS.logging.WARNING);
      // my.logger.server.set({'level':psychoJS.logging.WARNING, 'experimentInfo': my.expInfo});

      // if the experiment is running on the server:
      if (this.getEnvironment() === ExperimentHandler.Environment.SERVER) {
        // open a session:
        const params = {};
        if (this._serverMsg.has("__pilotToken")) {
          params.pilotToken = this._serverMsg.get("__pilotToken");
        }
        if (typeof surveyId !== "undefined") {
          params.surveyId = surveyId;
          this._surveyId = surveyId;
        }
        await this._serverManager.openSession(params);

        // warn the user when they attempt to close the tab or browser:
        this.beforeunloadCallback = (event) => {
          // preventDefault should ensure that the user gets prompted:
          event.preventDefault();

          // Chrome requires returnValue to be set:
          event.returnValue = "";
        };
        window.addEventListener("beforeunload", this.beforeunloadCallback);

        // when the user closes the tab or browser, we attempt to close the session,
        // optionally save the results, and release the WebGL context
        // note: we communicate with the server using the Beacon API
        const self = this;
        window.addEventListener("unload", (event) => {
          if (self._config.session.status === "OPEN") {
            // stop the regular uploading of results, if need be:
            if (self._config.experiment.resultsUpload.intervalId > 0) {
              clearInterval(self._config.experiment.resultsUpload.intervalId);
              self._config.experiment.resultsUpload.intervalId = -1;
            }

            // save the incomplete results if need be:
            if (
              self._config.experiment.saveIncompleteResults &&
              self._saveResults
            ) {
              // note: we set lastUploadTimestamp to undefined to prevent uploadData from throttling this call
              delete self._config.experiment.resultsUpload.lastUploadTimestamp;
              self._experiment.save({
                sync: true,
              });
            }

            // close the session:
            self._serverManager.closeSession(false, true);
          }

          if (typeof self._window !== "undefined") {
            self._window.close();
          }
        });

        // upload the data at regular interval, if need be:
        if (
          self._saveResults &&
          self._config.experiment.resultsUpload.period > 0
        ) {
          self._config.experiment.resultsUpload.intervalId = setInterval(
            () => {
              self._experiment.save({
                clear: false,
                tag: "",
              });
            },
            self._config.experiment.resultsUpload.period * 60 * 1000,
          );
        }
      }

      // start the asynchronous download of resources:
      this._serverManager.prepareResources(resources);

      // if WebGL is not actually available, warn the participant and ask them whether they want to go ahead
      if (this._checkWebGLSupport && !Window.checkWebGLSupport()) {
        // add an entry to experiment results to warn the designer about a potential WebGL issue:
        this._experiment.addData("hardware_acceleration", "NOT SUPPORTED");
        this._experiment.nextEntry();

        this._gui.dialog({
          onCancel: () => {
            this.quit();
          },
          onOK: () => {
            this.status = PsychoJS.Status.STARTED;
            this.logger.info(
              "[PsychoJS] Start Experiment (software emulation mode).",
            );
            this._scheduler.start();
          },
          showCancel: true,
          warning:
            "It appears that hardware acceleration is either not supported by your browser or currently switched off.<br>As a consequence, this experiment will be rendered using software emulation and advanced features, such as gratings and gamma correction, will not be available.<br><br>You may want to press Cancel, change your browser settings, and reload the experiment. Otherwise press OK to proceed as is.",
        });
      } else {
        if (this._autoStartScheduler) {
          this.status = PsychoJS.Status.STARTED;
          this.logger.info("[PsychoJS] Start Experiment.");
          this._scheduler.start();
        }
      }
    } catch (error) {
      this.status = PsychoJS.Status.ERROR;
      throw { ...response, error };
    }
  }

  /**
   * Block the experiment until the specified resources have been downloaded.
   *
   * <p>Note: only those resources that have not already been downloaded at that point are
   * considered.</p>
   *
   * <ul>
   *   <li>For an experiment running locally: the root directory for the specified resources is that of index.html
   *   unless they are prepended with a protocol, such as http:// or https://.</li>
   *   <li>For an experiment running on the server: if no resources are specified, all files in the resources directory
   *   of the experiment are downloaded, otherwise we only download the specified resources. All resources are assumed
   *   local to index.html unless they are prepended with a protocol.</li>
   *
   * @param {Array.<{name: string, path: string}>} [resources=[]] - the list of resources
   */
  waitForResources(resources = []) {
    const response = {
      context: "while waiting for resources to be downloaded",
      origin: "PsychoJS.waitForResources",
    };

    try {
      return this.serverManager.waitForResources(resources);
    } catch (error) {
      // this._gui.dialog({ error: { ...response, error } });
      this._gui.dialog({ error: Object.assign(response, { error }) });
    }
  }
}

/**
 * PsychoJS status.
 *
 * @enum {Symbol}
 * @readonly
 *
 * @note PsychoPy is currently moving away from STOPPED and replacing STOPPED by FINISHED.
 * For backward compatibility reasons, we are keeping
 * STOPPED in PsychoJS, but the Symbol is the same as that of FINISHED.
 */
PsychoJS.Status = {
  CONFIGURED: Symbol.for("CONFIGURED"),
  CONFIGURING: Symbol.for("CONFIGURING"),
  ERROR: Symbol.for("ERROR"),
  FINISHED: Symbol.for("FINISHED"),
  NOT_CONFIGURED: Symbol.for("NOT_CONFIGURED"),
  NOT_STARTED: Symbol.for("NOT_STARTED"),
  PAUSED: Symbol.for("PAUSED"),
  STARTED: Symbol.for("STARTED"),
  STOPPED: Symbol.for("FINISHED"), // Symbol.for('STOPPED')
};
