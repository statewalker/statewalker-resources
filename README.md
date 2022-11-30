# @statewalker/resources
## Resource Management Framework

It is like a File System for the Web
(Node, Deno, Bun, Browser)

This module provides a flexible way to manage resources stored locally or remotely.

A resource is just un URI/URL. So resource repositories can manage any kind of resources, existing on web or not. All real functionalities of resources - like possiblities to read or write content - are implemented as adapters. Some configurations can register adapters to read/write content on local disks, on remote resources - like web sites or S3 buckets etc. 
But resources can be extended - via adapters - not only to read and write content, but also to perform more complex operations - like documents parsing, transformations etc. Via adapters we can read TypeScript/JSX/markdown files from a remote Git repository and transform them to HTML/JS/CSS files stored in our static hosting server (or S3 bucket).
Via adapters we can read HTML content of Wikipedia and transform these pages to structured JSON objects sent to a SQLite database (which can be also accessible as a resource). 
And so on. 
Using Resource Repositories it become possible to implement transformation tools like Rollup/Webpack or Parcel which works in Node, Deno, Bun or directly in a web page.

If some functionalities are missing - it is very simple to add a new adapter implementing it. 

## License

[MIT](https://choosealicense.com/licenses/mit/)

