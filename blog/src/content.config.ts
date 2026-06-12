import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Absolute path to the blog content folder
export const collections = {
  blog: defineCollection({
    loader: glob({
        cwd: '.',
        pattern: 'src/content/blog/**/*.md',
        ignore: ['**/node_modules/**'],
      }),
    schema: z.object({
      title: z.string(),
description: z.string(),
articleId: z.string(),
seoTitle: z.string().optional(),
socialTitle: z.string().optional(),
publishedAt: z.string(),
updatedAt: z.string().optional(),
category: z.string().optional(),
image: z.string().optional(),
tags: z.array(z.string()).optional(),
featured: z.boolean().optional(),
draft: z.boolean().optional(),
    }),
  }),
};
