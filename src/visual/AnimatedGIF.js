/**
 * Animated gif sprite.
 *
 * @author Nikita Agafonov (https://github.com/lightest), Matt Karl (https://github.com/bigtimebuddy)
 * @copyright (c) 2020-2022 Open Science Tools Ltd. (https://opensciencetools.org)
 * @license Distributed under the terms of the MIT License
 *
 * @note Based on https://github.com/pixijs/gif and heavily modified.
 *
 */

import * as PIXI from "pixi.js-legacy";

/**
 * Runtime object to play animated GIFs. This object is similar to an AnimatedSprite.
 * It support playback (seek, play, stop) as well as animation speed and looping.
 */
class AnimatedGIF extends PIXI.Sprite
{
    /**
     * Default options for all AnimatedGIF objects.
     * @property {PIXI.SCALE_MODES} [scaleMode=PIXI.SCALE_MODES.LINEAR] - Scale mode to use for the texture.
     * @property {boolean} [loop=true] - To enable looping.
     * @property {number} [animationSpeed=1] - Speed of the animation.
     * @property {boolean} [autoUpdate=true] - Set to `false` to manage updates yourself.
     * @property {boolean} [autoPlay=true] - To start playing right away.
     * @property {Function} [onComplete=null] - The completed callback, optional.
     * @property {Function} [onLoop=null] - The loop callback, optional.
     * @property {Function} [onFrameChange=null] - The frame callback, optional.
     * @property {number} [fps=PIXI.Ticker.shared.FPS] - Default FPS.
     */
    static defaultOptions = {
        scaleMode: PIXI.SCALE_MODES.LINEAR,
        fps: PIXI.Ticker.shared.FPS,
        loop: true,
        animationSpeed: 1,
        autoPlay: true,
        autoUpdate: true,
        onComplete: null,
        onFrameChange: null,
        onLoop: null
    };

    /**
     * @param frames - Data of the GIF image.
     * @param options - Options for the AnimatedGIF
     */
    constructor(decompressedFrames, options)
    {
        // Get the options, apply defaults
        const { scaleMode, width, height, ...rest } = Object.assign({},
            AnimatedGIF.defaultOptions,
            options
        );

        super(new PIXI.Texture(PIXI.BaseTexture.fromBuffer(new Uint8Array(width * height * 4), width, height, options)));
        this._name = options.name;
        this._useFullFrames = false;
        this._decompressedFrameData = decompressedFrames;
        this._origDims = { width, height };
        let i, j, time = 0;
        this._frameTimings = new Array(decompressedFrames.length);
        for (i = 0; i < decompressedFrames.length; i++)
        {
            this._frameTimings[i] =
            {
                start: time,
                end: time + decompressedFrames[i].delay
            };
            time += decompressedFrames[i].delay;
        }
        this.duration = this._frameTimings[decompressedFrames.length - 1].end;
        this._fullPixelData = [];
        if (options.fullFrames !== undefined && options.fullFrames.length > 0)
        {
            this._fullPixelData = options.fullFrames;
            this._useFullFrames = true;
        }
        this._playing = false;
        this._currentTime = 0;
        this._isConnectedToTicker = false;
        Object.assign(this, rest);

        // Draw the first frame
        this.currentFrame = 0;
        this._prevRenderedFrameIdx = -1;
        if (this.autoPlay)
        {
            this.play();
        }
    }

    static updatePixelsForOneFrame (decompressedFrameData, pixelBuffer, gifWidth)
    {
        let i = 0;
        let patchRow = 0, patchCol = 0;
        let offset = 0;
        let colorData;

        if (decompressedFrameData.pixels.length === pixelBuffer.length / 4)
        {
            // Not all GIF files are perfectly optimized
            // and instead of having tiny patch of pixels that actually changed from previous frame
            // they would have a full next frame.
            // Knowing that, we can go faster by skipping math needed to determine where to put new pixels
            // and just place them 1 to 1 over existing frame (probably internal browser optimizations also kick in).
            // For large amounts of gifs running simultaniously this results in 58+FPS vs 15-25+FPS for "else" case.
            for (i = 0; i < decompressedFrameData.pixels.length; i++) {
                if (decompressedFrameData.pixels[i] !== decompressedFrameData.transparentIndex) {
                    colorData = decompressedFrameData.colorTable[decompressedFrameData.pixels[i]];
                    offset = i * 4;
                    pixelBuffer[offset] = colorData[0];
                    pixelBuffer[offset + 1] = colorData[1];
                    pixelBuffer[offset + 2] = colorData[2];
                    pixelBuffer[offset + 3] = 255;
                }
            }
        }
        else
        {
            for (i = 0; i < decompressedFrameData.pixels.length; i++) {
                if (decompressedFrameData.pixels[i] !== decompressedFrameData.transparentIndex) {
                    colorData = decompressedFrameData.colorTable[decompressedFrameData.pixels[i]];
                    patchRow = (i / decompressedFrameData.dims.width) | 0;
                    patchCol = i % decompressedFrameData.dims.width;
                    offset = (gifWidth * (decompressedFrameData.dims.top + patchRow) + decompressedFrameData.dims.left + patchCol) * 4;
                    pixelBuffer[offset] = colorData[0];
                    pixelBuffer[offset + 1] = colorData[1];
                    pixelBuffer[offset + 2] = colorData[2];
                    pixelBuffer[offset + 3] = 255;
                }
            }
        }

    }

    static computeFullFrames (decompressedFrames, gifWidth, gifHeight)
    {
        let t = performance.now();
        let i, j;
        let patchRow = 0, patchCol = 0;
        let offset = 0;
        let colorData;
        let pixelData = new Uint8Array(gifWidth * gifHeight * 4);
        let fullPixelData = new Uint8Array(gifWidth * gifHeight * 4 * decompressedFrames.length);
        for (i = 0; i < decompressedFrames.length; i++)
        {
            AnimatedGIF.updatePixelsForOneFrame(decompressedFrames[i], pixelData, gifWidth);
            fullPixelData.set(pixelData, pixelData.length * i);
        }
        console.log("full frames construction time", performance.now() - t);
        return fullPixelData;
    }

    _constructNthFullFrame (desiredFrameIdx, prevRenderedFrameIdx, decompressedFrames, pixelBuffer)
    {
        let t = performance.now();
        // saving to variable instead of referencing object in the loop wins up to 5ms!
        // (at the moment of development observed on Win10, Chrome 103.0.5060.114 (Official Build) (64-bit))
        const gifWidth = this._origDims.width;
        let i;
        for (i = prevRenderedFrameIdx + 1; i <= desiredFrameIdx; i++)
        {
            // this._updatePixelsForOneFrame(decompressedFrames[i], pixelBuffer);
            AnimatedGIF.updatePixelsForOneFrame(decompressedFrames[i], pixelBuffer, gifWidth)
        }
        // console.log("constructed frames from", prevRenderedFrameIdx, "to", desiredFrameIdx, "(", desiredFrameIdx - prevRenderedFrameIdx, ")", performance.now() - t);
    }

    /** Stops the animation. */
    stop()
    {
        if (!this._playing)
        {
            return;
        }

        this._playing = false;
        if (this._autoUpdate && this._isConnectedToTicker)
        {
            PIXI.Ticker.shared.remove(this.update, this);
            this._isConnectedToTicker = false;
        }
    }

    /** Plays the animation. */
    play()
    {
        if (this._playing)
        {
            return;
        }

        this._playing = true;
        if (this._autoUpdate && !this._isConnectedToTicker)
        {
            PIXI.Ticker.shared.add(this.update, this, PIXI.UPDATE_PRIORITY.HIGH);
            this._isConnectedToTicker = true;
        }

        // If were on the last frame and stopped, play should resume from beginning
        if (!this.loop && this.currentFrame === this._decompressedFrameData.length - 1)
        {
            this._currentTime = 0;
        }
    }

    /**
     * Get the current progress of the animation from 0 to 1.
     * @readonly
     */
    get progress()
    {
        return this._currentTime / this.duration;
    }

    /** `true` if the current animation is playing */
    get playing()
    {
        return this._playing;
    }

    /**
     * Updates the object transform for rendering. You only need to call this
     * if the `autoUpdate` property is set to `false`.
     *
     * @param deltaTime - Time since last tick.
     */
    update(deltaTime)
    {
        if (!this._playing)
        {
            return;
        }

        const elapsed = this.animationSpeed * deltaTime / PIXI.settings.TARGET_FPMS;
        const currentTime = this._currentTime + elapsed;
        const localTime = currentTime % this.duration;

        const localFrame = this._frameTimings.findIndex((ft) =>
            ft.start <= localTime && ft.end > localTime);

        if (this._prevRenderedFrameIdx > localFrame)
        {
            this._prevRenderedFrameIdx = -1;
        }

        if (currentTime >= this.duration)
        {
            if (this.loop)
            {
                this._currentTime = localTime;
                this.updateFrameIndex(localFrame);
                if (typeof this.onLoop === "function")
                {
                    this.onLoop();
                }
            }
            else
            {
                this._currentTime = this.duration;
                this.updateFrameIndex(this._decompressedFrameData.length - 1);
                if (typeof this.onComplete === "function")
                {
                    this.onComplete();
                }
                this.stop();
            }
        }
        else
        {
            this._currentTime = localTime;
            this.updateFrameIndex(localFrame);
        }
    }

    /**
     * Redraw the current frame, is necessary for the animation to work when
     */
    updateFrame()
    {
        // if (!this.dirty)
        // {
        //     return;
        // }

        if (this._prevRenderedFrameIdx === this._currentFrame)
        {
            return;
        }

        // Update the current frame
        if (this._useFullFrames)
        {
            this.texture.baseTexture.resource.data = new Uint8Array
            (
                this._fullPixelData.buffer, this._currentFrame * this._origDims.width * this._origDims.height * 4,
                this._origDims.width * this._origDims.height * 4
            );
        }
        else
        {
            // this._updatePixelsForOneFrame(this._decompressedFrameData[this._currentFrame], this.texture.baseTexture.resource.data);
            this._constructNthFullFrame(this._currentFrame, this._prevRenderedFrameIdx, this._decompressedFrameData, this.texture.baseTexture.resource.data);
        }

        this.texture.update();
        // Mark as clean
        // this.dirty = false;
        this._prevRenderedFrameIdx = this._currentFrame;
    }

    /**
     * Renders the object using the WebGL renderer
     *
     * @param {PIXI.Renderer} renderer - The renderer
     * @private
     */
    _render(renderer)
    {
        let t = performance.now();
        this.updateFrame();
        // console.log("t2", this._name, performance.now() - t);
        super._render(renderer);
    }

    /**
     * Renders the object using the WebGL renderer
     *
     * @param {PIXI.CanvasRenderer} renderer - The renderer
     * @private
     */
    _renderCanvas(renderer)
    {
        this.updateFrame();
        super._renderCanvas(renderer);
    }

    /**
     * Whether to use PIXI.Ticker.shared to auto update animation time.
     * @default true
     */
    get autoUpdate()
    {
        return this._autoUpdate;
    }

    set autoUpdate(value)
    {
        if (value !== this._autoUpdate)
        {
            this._autoUpdate = value;

            if (!this._autoUpdate && this._isConnectedToTicker)
            {
                PIXI.Ticker.shared.remove(this.update, this);
                this._isConnectedToTicker = false;
            }
            else if (this._autoUpdate && !this._isConnectedToTicker && this._playing)
            {
                PIXI.Ticker.shared.add(this.update, this);
                this._isConnectedToTicker = true;
            }
        }
    }

    /** Set the current frame number */
    get currentFrame()
    {
        return this._currentFrame;
    }

    set currentFrame(value)
    {
        this.updateFrameIndex(value);
        this._currentTime = this._frameTimings[value].start;
    }

    /** Internally handle updating the frame index */
    updateFrameIndex(value)
    {
        if (value < 0 || value >= this._decompressedFrameData.length)
        {
            throw new Error(`Frame index out of range, expecting 0 to ${this.totalFrames}, got ${value}`);
        }
        if (this._currentFrame !== value)
        {
            this._currentFrame = value;
            // this.dirty = true;
            if (typeof this.onFrameChange === "function")
            {
                this.onFrameChange(value);
            }
        }
    }

    /**
     * Get the total number of frame in the GIF.
     */
    get totalFrames()
    {
        return this._decompressedFrameData.length;
    }

    /** Destroy and don't use after this. */
    destroy()
    {
        this.stop();
        super.destroy(true);
        this._decompressedFrameData = null;
        this._fullPixelData = null;
        this.onComplete = null;
        this.onFrameChange = null;
        this.onLoop = null;
    }

    /**
     * Cloning the animation is a useful way to create a duplicate animation.
     * This maintains all the properties of the original animation but allows
     * you to control playback independent of the original animation.
     * If you want to create a simple copy, and not control independently,
     * then you can simply create a new Sprite, e.g. `const sprite = new Sprite(animation.texture)`.
     */
    clone()
    {
        return new AnimatedGIF([...this._decompressedFrameData], {
            autoUpdate: this._autoUpdate,
            loop: this.loop,
            autoPlay: this.autoPlay,
            scaleMode: this.texture.baseTexture.scaleMode,
            animationSpeed: this.animationSpeed,
            width: this._origDims.width,
            height: this._origDims.height,
            onComplete: this.onComplete,
            onFrameChange: this.onFrameChange,
            onLoop: this.onLoop,
        });
    }
}

export { AnimatedGIF };
