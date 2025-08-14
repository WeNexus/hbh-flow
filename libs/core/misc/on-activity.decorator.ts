import { applyDecorators } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Resource } from '@prisma/client';

/**
 * Decorator to listen for activity events on specified resources.
 * This decorator will trigger the decorated method when an activity event occurs for any of the specified resources
 *
 * @param resources - An array of resources to listen for activity events on.
 * @returns A method decorator that listens for activity events on the specified resources.
 */
export function OnActivity(resources: Resource[]) {
  return applyDecorators(...resources.map((r) => OnEvent(`activity.${r}`)));
}
