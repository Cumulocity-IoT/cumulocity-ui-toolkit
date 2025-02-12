import { Component, Input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { CommonModule } from '@angular/common';
import { CarouselModule, CarouselConfig } from 'ngx-bootstrap/carousel';
import { GalleryImages } from './image-gallery.model';
import { ViewEncapsulation } from '@angular/core';


@Component({
    selector: 'image-gallery',
    templateUrl: './image-gallery.component.html',
    encapsulation: ViewEncapsulation.None, 
    providers: [{ provide: CarouselConfig, useValue: { interval: 0, noPause: true, showIndicators: true } } ],
    
    standalone: true,
    imports: [CoreModule, CommonModule, CarouselModule],
  })
  export class ImageGalleryComponent {
    private _interval = 5000;
    /**
     * * Set the value of `interval`.
     *  *
     *  * This input setter allows you to control the `interval` property, which is the interval 
     *  * for auto changing images. A negative or zero value disables auto changing.
     *  *
     *  * @param value - the interval for auto changing images. A negative or zero value disables auto changing.
     */
    @Input()
    public set interval(value) {
      this._interval = value;
    }
    public get interval() {
      return this._interval;
    }

    private _noPause = false;
    /**
     * * Set the value of `noPause`.
     *  *
     *  * This input setter allows you to control the `noPause` property, which controls if a user can 
     *  * pause the carousel or not.
     *  *
     *  * @param value - Boolean whether users can pause the carousel.
     */    
    @Input()
    public set noPause(value) {
      this._noPause = value;
    }
    public get noPause() {
      return this._noPause;
    }

    private _noWrap = false;
    /**
     * * Set the value of `noWrap`.
     *  *
     *  * This input setter allows you to control the `noWrap` property, which controls if the carousel
     *  * wraps back to the first image after reaching the last image.
     *  *
     *  * @param value - Boolean whether the carousel wraps around.
     */
    @Input()
    public set noWrap(value) {
      this._noWrap = value;
    }
    public get noWrap() {
      return this._noWrap;
    }

    private _showIndicators = true;
    /**
     * * Set the value of `showIndicators`.
     *  *
     *  * This input setter allows you to control the `showIndicators` property, which controls if 
     *  * indicators for manual navigation are shown.
     *  *
     *  * @param value - Boolean whether indicators for manual navigation are shown.
     */
    @Input()
    public set showIndicators(value) {
      this._showIndicators = value;
    }
    public get showIndicators() {
      return this._showIndicators;
    }

    private _pauseOnFocus = false;
     /**
     * * Set the value of `pauseOnFocus`.
     *  *
     *  * This input setter allows you to control the `pauseOnFocus` property, which controls if 
     *  * the image carousel can be paused on focus.
     *  *
     *  * @param value - Boolean whether the carousel can be paused on focus.
     */    
    @Input()
    public set pauseOnFocus(value) {
      this._pauseOnFocus = value;
    }
    public get pauseOnFocus() {
      return this._pauseOnFocus;
    }

    private _gallery!: GalleryImages;
    /**
     * * Set the value of `gallery`.
     *  *
     *  * This input setter allows you to control the `gallery` property, which contains the list of 
     *  * images to show in the gallery. The images are the path or URL of the images.
     *  *
     *  * @param value - A GalleryImages object containing the path to the individual images
     */
    @Input()
    public set gallery(value: GalleryImages) {
      this._gallery = value;
    }
    public get gallery(): GalleryImages {
      return this._gallery;
    }
    
  }