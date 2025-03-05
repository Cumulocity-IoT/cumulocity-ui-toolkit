import { Component, Input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { CommonModule } from '@angular/common';
import { CarouselModule } from 'ngx-bootstrap/carousel';
import { GalleryImages } from './image-gallery.model';
import { ViewEncapsulation } from '@angular/core';


@Component({
    selector: 'image-gallery',
    templateUrl: './image-gallery.component.html',
    encapsulation: ViewEncapsulation.None, 
    standalone: true,
    imports: [CoreModule, CommonModule, CarouselModule],
  })
  export class ImageGalleryComponent {
    /**
     *  * Set the value of `interval`.
     *  * the interval for auto changing images. A negative or zero value disables auto changing.
     */
    @Input()
    interval = 5000;

    /**
     * * Set the value of `noPause`.
     * * Boolean whether users can pause the carousel.
     */    
    @Input()
    noPause = false;

    /**
     *  * Boolean whether the carousel wraps around.
     */
    @Input()
    noWrap = false;

    /**
     *  * Boolean whether indicators for manual navigation are shown.
     */
    @Input()
    showIndicators = true;

     /**
     * * Boolean whether the carousel can be paused on focus.
     */    
     @Input()
     pauseOnFocus = false;

    /**
     *  * Contains the list of images to show in the gallery. The images are the path or URL of the images.
     *  *
     */
    @Input()
    gallery!: GalleryImages;

  }