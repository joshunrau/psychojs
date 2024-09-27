/**
 * Sound player interface
 *
 * @author Alain Pitiot
 * @copyright (c) 2017-2020 Ilixa Ltd. (http://ilixa.com) (c) 2020-2024 Open Science Tools Ltd. (https://opensciencetools.org)
 * @license Distributed under the terms of the MIT License
 */

import { PsychObject } from "../util/PsychObject.js";

/**
 * SoundPlayer is an interface for the sound players, who are responsible for actually playing the sounds, i.e. the tracks or the tones.
 *
 * @interface
 * @extends PsychObject
 */
export class SoundPlayer extends PsychObject {
  /**
   * @param {module:core.PsychoJS} psychoJS - the PsychoJS instance
   */
  constructor(psychoJS) {
    super(psychoJS);
  }

  /**
   * Get the duration of the sound, in seconds.
   *
   * @abstract
   */
  getDuration() {
    throw {
      context: "when getting the duration of the sound",
      error: "this method is abstract and should not be called.",
      origin: "SoundPlayer.getDuration",
    };
  }

  /**
   * Start playing the sound.
   *
   * @abstract
   * @param {number} [loops] - how many times to repeat the sound after it has played once. If loops == -1, the sound will repeat indefinitely until stopped.
   */
  play(loops) {
    throw {
      context: "when starting the playback of a sound",
      error: "this method is abstract and should not be called.",
      origin: "SoundPlayer.play",
    };
  }

  /**
   * Set the duration of the sound, in seconds.
   *
   * @abstract
   */
  setDuration(duration_s) {
    throw {
      context: "when setting the duration of the sound",
      error: "this method is abstract and should not be called.",
      origin: "SoundPlayer.setDuration",
    };
  }

  /**
   * Set the number of loops.
   *
   * @abstract
   * @param {number} loops - how many times to repeat the sound after it has played once. If loops == -1, the sound will repeat indefinitely until stopped.
   */
  setLoops(loops) {
    throw {
      context: "when setting the number of loops",
      error: "this method is abstract and should not be called.",
      origin: "SoundPlayer.setLoops",
    };
  }

  /**
   * Set the volume of the tone.
   *
   * @abstract
   * @param {Integer} volume - the volume of the tone
   * @param {boolean} [mute= false] - whether or not to mute the tone
   */
  setVolume(volume, mute = false) {
    throw {
      context: "when setting the volume of the sound",
      error: "this method is abstract and should not be called.",
      origin: "SoundPlayer.setVolume",
    };
  }

  /**
   * Stop playing the sound immediately.
   *
   * @abstract
   */
  stop() {
    throw {
      context: "when stopping the playback of a sound",
      error: "this method is abstract and should not be called.",
      origin: "SoundPlayer.stop",
    };
  }
}
