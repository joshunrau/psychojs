/** @module visual **/
/**
 * Base class for all visual stimuli.
 *
 * @author Alain Pitiot
 * @version 2022.2.3
 * @copyright (c) 2017-2020 Ilixa Ltd. (http://ilixa.com) (c) 2020-2022 Open Science Tools Ltd. (https://opensciencetools.org)
 * @license Distributed under the terms of the MIT License
 */

import * as PIXI from "pixi.js-legacy";
import { MinimalStim } from "../core/MinimalStim.js";
import { WindowMixin } from "../core/WindowMixin.js";
import * as util from "../util/Util.js";

/**
 * Base class for all visual stimuli.
 *
 * @extends MinimalStim
 * @mixes WindowMixin
 */
export class VisualStim extends util.mix(MinimalStim).with(WindowMixin)
{
	/**
	 * @param {Object} options
	 * @param {String} options.name - the name used when logging messages from this stimulus
	 * @param {module:core.Window} options.win - the associated Window
	 * @param {string} [options.units= "height"] - the units of the stimulus (e.g. for size, position, vertices)
	 * @param {number} [options.ori= 0.0] - the orientation (in degrees)
	 * @param {number} [options.opacity= 1.0] - the opacity
	 * @param {number} [options.depth= 0] - the depth (i.e. the z order)
	 * @param {Array.<number>} [options.pos= [0, 0]] - the position of the center of the stimulus
	 * @param {string} [options.anchor = "center"] - sets the origin point of the stim
	 * @param {number} [options.size= 1.0] - the size
	 * @param {PIXI.Graphics} [options.clipMask= null] - the clip mask
	 * @param {boolean} [options.autoDraw= false] - whether or not the stimulus should be automatically drawn on every frame flip
	 * @param {boolean} [options.autoLog= false] - whether or not to log
	 * @param {boolean} [options.draggable= false] - whether or not to make stim draggable with mouse/touch/other pointer device
	 */
	constructor({ name, win, units, ori, opacity, depth, pos, anchor, size, clipMask, autoDraw, autoLog, draggable } = {})
	{
		super({ win, name, autoDraw, autoLog });

		this._addAttribute(
			"units",
			units,
			(typeof win !== "undefined" && win !== null) ? win.units : "height",
			this._onChange(true, true),
		);
		this._addAttribute(
			"pos",
			pos,
			[0, 0],
		);
		this._addAttribute(
			"anchor",
			anchor,
			"center",
		);
		this._addAttribute(
			"size",
			size,
			undefined,
		);
		this._addAttribute(
			"ori",
			ori,
			0.0,
		);
		this._addAttribute(
			"opacity",
			opacity,
			1.0,
			this._onChange(true, false),
		);
		this._addAttribute(
			"depth",
			depth,
			0,
			this._onChange(false, false),
		);
		this._addAttribute(
			"clipMask",
			clipMask,
			null,
			this._onChange(false, false),
		);
		this._addAttribute("draggable", draggable, false);

		// data needed to properly support drag and drop functionality
		this._associatedPointerId = undefined;
		this._initialPointerOffset = [0, 0];
		this._pointerEventHandlersUuids = {};

		// bounding box of the stimulus, in stimulus units
		// note: boundingBox does not take the orientation into account
		this._addAttribute("boundingBox", PIXI.Rectangle.EMPTY);

		// the stimulus need to be updated:
		this._needUpdate = true;

		// the PIXI representation also needs to be updated:
		this._needPixiUpdate = true;
	}

	/**
	 * Whether or not stimuli is being dragged by pointer. Works in conjunction with draggable attribute.
	 */
	get isDragging()
	{
		return this._associatedPointerId !== undefined;
	}

	/**
	 * Force a refresh of the stimulus.
	 *
	 * refresh() is called, in particular, when the Window is resized.
	 */
	refresh()
	{
		this._onChange(true, true)();
	}

	/**
	 * Setter for the size attribute.
	 *
	 * @param {undefined | null | number | number[]} size - the stimulus size
	 * @param {boolean} [log= false] - whether of not to log
	 */
	setSize(size, log = false)
	{
		// size is either undefined, null, or a tuple of numbers:
		if (typeof size !== "undefined" && size !== null)
		{
			size = util.toNumerical(size);
			if (!Array.isArray(size))
			{
				size = [size, size];
			}
		}

		const hasChanged = this._setAttribute("size", size, log);

		if (hasChanged)
		{
			this._onChange(true, true)();
		}
	}

	/**
	 * Setter for the orientation attribute.
	 *
	 * @param {number} ori - the orientation in degree with 0 as the vertical position, positive values rotate clockwise.
	 * @param {boolean} [log= false] - whether of not to log
	 */
	setOri(ori, log = false)
	{
		const hasChanged = this._setAttribute("ori", ori, log);

		if (hasChanged)
		{
			let radians = -ori * 0.017453292519943295;
			this._rotationMatrix = [
				[Math.cos(radians), -Math.sin(radians)],
				[Math.sin(radians), Math.cos(radians)]
			];

			if (this._pixi instanceof PIXI.DisplayObject) {
				this._pixi.rotation = -ori * Math.PI / 180;
			} else {
				this._onChange(true, true)();
			}
		}
	}

	/**
	 * Setter for the position attribute.
	 *
	 * @param {Array.<number>} pos - position of the center of the stimulus, in stimulus units
	 * @param {boolean} [log= false] - whether of not to log
	 */
	setPos(pos, log = false)
	{
		const prevPos = this._pos;
		const hasChanged = this._setAttribute("pos", util.toNumerical(pos), log);

		if (hasChanged)
		{
			this._needUpdate = true;

			// update the bounding box, without calling _estimateBoundingBox:
			this._boundingBox.x += this._pos[0] - prevPos[0];
			this._boundingBox.y += this._pos[1] - prevPos[1];
		}
	}

	/**
	 * Setter for the draggable attribute.
	 *
	 * @name module:visual.VisualStim#setDraggable
	 * @public
	 * @param {boolean} [draggable=false] - whether or not to make stim draggable using mouse/touch/other pointer device
	 * @param {boolean} [log= false] - whether of not to log
	 */
	setDraggable(draggable = false, log = false)
	{
		const hasChanged = this._setAttribute("draggable", draggable, log);
		if (hasChanged)
		{
			if (draggable)
			{
				this._pointerEventHandlersUuids[ "pointerdown" ] = this._win.on("pointerdown", this._handlePointerDown.bind(this));
				this._pointerEventHandlersUuids[ "pointerup" ] = this._win.on("pointerup", this._handlePointerUp.bind(this));
				this._pointerEventHandlersUuids[ "pointermove" ] = this._win.on("pointermove", this._handlePointerMove.bind(this));
			}
			else
			{
				this._win.off("pointerdown", this._pointerEventHandlersUuids[ "pointerdown" ]);
				this._win.off("pointerup", this._pointerEventHandlersUuids[ "pointerup" ]);
				this._win.off("pointermove", this._pointerEventHandlersUuids[ "pointermove" ]);
			}
		}
	}

	/**
	 * Setter for the depth attribute.
	 *
	 * @param {Array.<number>} depth - order in which stimuli is rendered, kind of css's z-index with a negative sign.
	 * @param {boolean} [log= false] - whether of not to log
	 */
	setDepth(depth = 0, log = false)
	{
		this._setAttribute("depth", depth, log);
		if (this._pixi)
		{
			this._pixi.zIndex = -this._depth;
		}
	}

	/**
	 * Determine whether an object is inside the bounding box of the stimulus.
	 *
	 * @param {Object} object - the object
	 * @param {string} units - the units
	 * @return {boolean} whether or not the object is inside the bounding box of the stimulus
	 */
	contains(object, units)
	{
		// get the position of the object, in pixel coordinates:
		const objectPos_px = util.getPositionFromObject(object, units);

		if (typeof objectPos_px === "undefined")
		{
			throw {
				origin: "VisualStim.contains",
				context: "when determining whether VisualStim: " + this._name + " contains object: " + util.toString(object),
				error: "unable to determine the position of the object",
			};
		}

		// test for inclusion:
		return this._getBoundingBox_px().contains(objectPos_px[0], objectPos_px[1]);
	}

	/**
	 * Determine whether a point that is nown to have pixel dimensions is inside the bounding box of the stimulus.
	 *
	 * @name module:visual.VisualStim#containsPointPx
	 * @public
	 * @param {number[]} point_px - the point in pixels
	 * @return {boolean} whether or not the object is inside the bounding box of the stimulus
	 */
	containsPointPx (point_px)
	{
		return this._getBoundingBox_px().contains(point_px[0], point_px[1]);
	}

	/**
	 * Release the PIXI representation, if there is one.
	 *
	 * @name module:core.VisualStim#release
	 * @function
	 * @public
	 *
	 * @param {boolean} [log= false] - whether or not to log
	 */
	release(log = false)
	{
		this.draggable = false;
		super.release(log);
	}

	/**
	 * Handler of pointerdown event.
	 *
	 * @name module:visual.VisualStim#_handlePointerDown
	 * @private
	 * @param {Object} e - pointerdown event data.
	 */
	_handlePointerDown (e)
	{
		if (e.pixi === undefined || e.pixi !== this._pixi)
		{
			return;
		}
		let relativePos = [];
		let pixPos = util.to_unit(this._pos, this._units, this._win, "pix");
		relativePos[0] = e.originalEvent.pageX - this._win.size[0] * 0.5 - this._pixi.parent.position.x;
		relativePos[1] = -(e.originalEvent.pageY - this._win.size[1] * 0.5) - this._pixi.parent.position.y;
		this._associatedPointerId = e.originalEvent.pointerId;
		this._initialPointerOffset[0] = relativePos[0] - pixPos[0];
		this._initialPointerOffset[1] = relativePos[1] - pixPos[1];
		this.emit("pointerdown", e);
	}

	/**
	 * Handler of pointerup event.
	 *
	 * @name module:visual.VisualStim#_handlePointerUp
	 * @private
	 * @param {Object} e - pointerup event data.
	 */
	_handlePointerUp (e)
	{
		if (e.originalEvent.pointerId === this._associatedPointerId)
		{
			this._associatedPointerId = undefined;
			this._initialPointerOffset.fill(0);
			this.emit("pointerup", e);
		}
	}

	/**
	 * Handler of pointermove event.
	 *
	 * @name module:visual.VisualStim#_handlePointerMove
	 * @private
	 * @param {Object} e - pointermove event data.
	 */
	_handlePointerMove (e)
	{
		if (e.originalEvent.pointerId === this._associatedPointerId)
		{
			let newPos = [];
			newPos[ 0 ] = e.originalEvent.pageX - this._win.size[ 0 ] * 0.5 - this._pixi.parent.position.x - this._initialPointerOffset[ 0 ];
			newPos[ 1 ] = -(e.originalEvent.pageY - this._win.size[ 1 ] * 0.5) - this._pixi.parent.position.y - this._initialPointerOffset[ 1 ];
			this.setPos(util.to_unit(newPos, "pix", this._win, this._units));
			this.emit("pointermove", e);
		}
	}

	/**
	 * Setter for the anchor attribute.
	 *
	 * @param {string} anchor - anchor of the stim
	 * @param {boolean} [log= false] - whether or not to log
	 */
	setAnchor (anchor = "center", log = false)
	{
		this._setAttribute("anchor", anchor, log);
		if (this._pixi !== undefined)
		{
			const anchorNum = this._anchorTextToNum(this._anchor);
			if (this._pixi.anchor !== undefined)
			{
				this._pixi.anchor.x = anchorNum[0];
				this._pixi.anchor.y = anchorNum[1];
			}
			else
			{
				this._pixi.pivot.x = anchorNum[0] * this._pixi.scale.x * this._pixi.width;
				this._pixi.pivot.y = anchorNum[1] * this._pixi.scale.y * this._pixi.height;
			}
		}
	}

	/**
	 * Convert the anchor attribute into numerical values.
	 *
	 * @protected
	 * @param {string} anchorText - text version of anchor value ["top-left", "top-right", "center", ...]
	 * @return {number[]} - the anchor, as an array of numbers in [0,1]
	 */
	_anchorTextToNum(anchorText = "")
	{
		const anchor = [0.5, 0.5];

		if (anchorText.indexOf("left") > -1)
		{
			anchor[0] = 0.0;
		}
		else if (anchorText.indexOf("right") > -1)
		{
			anchor[0] = 1.0;
		}

		if (anchorText.indexOf("top") > -1)
		{
			anchor[1] = 0.0;
		}
		else if (anchorText.indexOf("bottom") > -1)
		{
			anchor[1] = 1.0;
		}

		return anchor;
	}

	/**
	 * Estimate the bounding box.
	 *
	 * @protected
	 */
	_estimateBoundingBox()
	{
		throw {
			origin: "VisualStim._estimateBoundingBox",
			context: `when estimating the bounding box of visual stimulus: ${this._name}`,
			error: "this method is abstract and should not be called.",
		};
	}

	/**
	 * Get the bounding box in pixel coordinates
	 *
	 * @protected
	 * @returns {PIXI.Rectangle} the bounding box, in pixel coordinates
	 */
	_getBoundingBox_px()
	{
		if (this._units === "pix")
		{
			return this._boundingBox.clone();
		}
		else if (this._units === "norm")
		{
			return new PIXI.Rectangle(
				this._boundingBox.x * this._win.size[0] / 2,
				this._boundingBox.y * this._win.size[1] / 2,
				this._boundingBox.width * this._win.size[0] / 2,
				this._boundingBox.height * this._win.size[1] / 2,
			);
		}
		else if (this._units === "height")
		{
			const minSize = Math.min(this._win.size[0], this._win.size[1]);
			return new PIXI.Rectangle(
				this._boundingBox.x * minSize,
				this._boundingBox.y * minSize,
				this._boundingBox.width * minSize,
				this._boundingBox.height * minSize,
			);
		}
		else
		{
			throw Object.assign(response, { error: `unknown units: ${this._units}` });
		}
	}

	/**
	 * Generate a callback that prepares updates to the stimulus.
	 * This is typically called in the constructor of a stimulus, when attributes are added
	 * 	with _addAttribute.
	 *
	 * @protected
	 * @param {boolean} [withPixi = false] - whether or not the PIXI representation must
	 * 	also be updated
	 * @param {boolean} [withBoundingBox = false] - whether or not to immediately estimate
	 * 	the bounding box
	 * @return {Function}
	 */
	_onChange(withPixi = false, withBoundingBox = false)
	{
		return () =>
		{
			this._needUpdate = true;
			if (withPixi)
			{
				this._needPixiUpdate = true;
			}
			if (withBoundingBox)
			{
				this._estimateBoundingBox();
			}
		};
	}
}
