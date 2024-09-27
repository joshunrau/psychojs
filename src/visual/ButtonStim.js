/**
 * Button Stimulus.
 *
 * @author Alain Pitiot
 * @copyright (c) 2017-2020 Ilixa Ltd. (http://ilixa.com) (c) 2020-2024 Open Science Tools Ltd. (https://opensciencetools.org)
 * @license Distributed under the terms of the MIT License
 */

import { Mouse } from "../core/Mouse.js";
import * as util from "../util/Util";
import { TextBox } from "./TextBox.js";

/**
 * ButtonStim visual stimulus.
 *
 * @extends TextBox
 */
export class ButtonStim extends TextBox {
  /**
   * @param {Object} options
   * @param {module:core.Window} options.win - the associated Window
   * @param {String} options.name - the name used when logging messages from this stimulus
   * @param {string} [options.text=""] - the text to be rendered
   * @param {string} [options.font= "Arial"] - the font family
   * @param {Array.<number>} [options.pos= [0, 0]] - the position of the center of the text
   * @param {string} [options.anchor= "center"] - horizontal alignment
   * @param {string} [options.units= "norm"] - the units of the text size and position
   * @param {Color} [options.color= Color("white")] the background color
   * @param {Color} [options.fillColor= Color("darkgrey")] the fill color
   * @param {Color} [options.borderColor= Color("white")] the border color
   * @param {Color} [options.borderWidth= 0] the border width
   * @param {number} [options.opacity= 1.0] - the opacity
   * @param {number} [options.depth= 0] - the depth (i.e. the z order)
   * @param {number} [options.letterHeight= undefined] - the height of the text
   * @param {boolean} [options.bold= true] - whether or not the text is bold
   * @param {boolean} [options.italic= false] - whether or not the text is italic
   * @param {boolean} [options.autoDraw= false] - whether or not the stimulus should be automatically drawn on every frame flip
   * @param {boolean} [options.autoLog= false] - whether or not to log
   */
  constructor({
    anchor = "center",
    autoDraw,
    autoLog,
    bold = true,
    borderColor,
    borderWidth = 0,
    boxFn,
    color,
    depth,
    fillColor = "darkgrey",
    font,
    italic,
    letterHeight,
    multiline,
    name,
    opacity,
    padding,
    pos,
    size,
    text,
    units,
    win,
  } = {}) {
    super({
      alignment: "center",
      anchor,
      autoDraw,
      autoLog,
      bold,
      borderColor,
      borderWidth,
      boxFn,
      color,
      depth,
      fillColor,
      font,
      italic,
      letterHeight,
      multiline,
      name,
      opacity,
      padding,
      placeholder: text,
      pos,
      size,
      text,
      units,
      win,
    });

    this.psychoJS.logger.debug("create a new Button with name: ", name);

    this.listener = new Mouse({ autoLog, name, win });

    this._addAttribute("wasClicked", false);

    // Arrays to store times of clicks on and off
    this._addAttribute("timesOn", []);

    this._addAttribute("timesOff", []);

    if (this._autoLog) {
      this._psychoJS.experimentLogger.exp(
        `Created ${this.name} = ${util.toString(this)}`,
      );
    }
  }

  /**
   * Is this button currently being clicked on?
   *
   * @returns {boolean} whether or not the button is being clicked on
   */
  get isClicked() {
    return this.listener.isPressedIn(this, [1, 0, 0]);
  }

  /**
   * How many times has this button been clicked on?
   *
   * @returns {number} the number of times the button has been clicked on
   */
  get numClicks() {
    return this.timesOn.length;
  }

  /**
   * Clear the previously stored times on and times off.
   *
   * @returns {void}
   */
  reset() {
    this.wasClicked = this.isClicked;

    this.timesOn = [];
    this.timesOff = [];

    super.reset();
  }
}
