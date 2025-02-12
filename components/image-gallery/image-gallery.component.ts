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