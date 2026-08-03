import { Component, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { CarouselModule } from 'ngx-bootstrap/carousel';
import { GalleryImages } from './image-gallery.model';
import { ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'image-gallery',
  templateUrl: './image-gallery.component.html',
  encapsulation: ViewEncapsulation.None,
  standalone: true,
  imports: [CoreModule, CarouselModule],
})
export class ImageGalleryComponent {
  /**
   *  * Set the value of `interval`.
   *  * the interval for auto changing images. A negative or zero value disables auto changing.
   */
  interval = input(5000);

  /**
   * * Set the value of `noPause`.
   * * Boolean whether users can pause the carousel.
   */
  noPause = input(false);

  /**
   *  * Boolean whether the carousel wraps around.
   */
  noWrap = input(false);

  /**
   *  * Boolean whether indicators for manual navigation are shown.
   */
  showIndicators = input(true);

  /**
   * * Boolean whether the carousel can be paused on focus.
   */
  pauseOnFocus = input(false);

  /**
   *  * Contains the list of images to show in the gallery. The images are the path or URL of the images.
   *  *
   */
  gallery = input.required<GalleryImages>();
}
