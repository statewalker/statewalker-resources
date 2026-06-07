export default [
  {
    message: "return empty values for non-existing mappings",
    mapping: [],
    uris: [
      ["foobar", null],
      ["./foobar", null],
      ["http://www.foo.bar/", null],
    ],
  },
  {
    message: "should map files based on one mapping",
    mapping: [{ source: "file:///tmp/", target: "/hello/" }],
    uris: [
      ["file:///tmp/", "/hello/"],
      ["file:///tmp/index.md", "/hello/index.md"],
      ["file:///tmp/about/contacts.md", "/hello/about/contacts.md"],
      ["file:///tmp/assets/myimage.jpg", "/hello/assets/myimage.jpg"],
    ],
  },
  {
    message: "should map files with common paths",
    mapping: [
      { source: "file:///tmp/", target: "/hello/" },
      { source: "file:///tmp/assets/", target: "/bulk/" },
      { source: "file:///tmp/about/", target: "/a/" },
    ],
    uris: [
      ["file:///tmp/", "/hello/"],
      ["file:///tmp/index.md", "/hello/index.md"],
      ["file:///tmp/about/contacts.md", "/a/contacts.md"],
      ["file:///tmp/assets/myimage.jpg", "/bulk/myimage.jpg"],
    ],
  },
  {
    message: "should map files with common paths",
    mapping: [
      { source: "file:///tmp/", target: "./hello/" },
      { source: "file:///tmp/assets/", target: "/bulk/" },
      { source: "file:///tmp/about/", target: "/foo/bar/a/" },
    ],
    uris: [
      ["file:///tmp/", "./hello/"],
      ["file:///tmp/index.md", "./hello/index.md"],
      ["file:///tmp/about/contacts.md", "/foo/bar/a/contacts.md"],
      ["file:///tmp/assets/myimage.jpg", "/bulk/myimage.jpg"],
    ],
  },
  {
    message: "should map urls to paths",
    mapping: [
      { source: "http://www.foo.bar/tech/docs/", target: "/" },
      { source: "http://www.foo.bar/assets/img/", target: "/images/" },
    ],
    uris: [
      ["foobar", null],
      ["./foobar", null],
      ["http://www.foo.bar/", null],
      ["http://www.foo.bar/tech/something.md", null],
      ["http://www.foo.bar/tech/docs/readme.md", "/readme.md"],
      ["http://www.foo.bar/tech/docs/about/us.md", "/about/us.md"],
      ["http://www.foo.bar/assets/img/MyImage.jpg", "/images/MyImage.jpg"],
    ],
  },
  {
    message: "should map urls from various domains",
    mapping: [
      { source: "http://www.foo.bar/tech/docs/", target: "/" },
      { source: "http://assets.foo-bar.com/img/", target: "/images/" },
    ],
    uris: [
      ["foobar", null],
      ["./foobar", null],
      ["http://www.foo.bar/", null],
      ["http://www.foo.bar/tech/something.md", null],
      ["http://www.foo.bar/tech/docs/readme.md", "/readme.md"],
      ["http://www.foo.bar/tech/docs/about/us.md", "/about/us.md"],
      ["http://assets.foo-bar.com/img/MyImage.jpg", "/images/MyImage.jpg"],
    ],
  },
  {
    message: "should resolve url collisions",
    mapping: [
      {
        source: "file:///tmp/data/",
        target: "./toto/",
      },
      {
        source: "file:///tmp/data/assets/",
        target: "./bulk/",
      },
    ],
    uris: [
      ["file:///tmp/data/index.html", "./toto/index.html"],
      ["file:///tmp/data/assets/css/main.css", "./bulk/css/main.css"],
    ],
  },
  {
    message: "Mixed schema rewriging",
    mapping: [
      { source: "./sources/", target: "/" },
      { source: "file:///tmp/data/", target: "/toto/" },
      { source: "http://www.foo.bar/tech/", target: "/docs/" },
      { source: "http://www.foo.bar/assets/img/", target: "/images/" },
    ],
    uris: [
      ["file:///tmp/data/products/prices.md", "/toto/products/prices.md"],
      ["./sources/index.md", "/index.md"],
      ["http://www.foo.bar/tech/readme.md", "/docs/readme.md"],
      ["http://www.foo.bar/assets/img/MyImage.jpg", "/images/MyImage.jpg"],
      ["file:///tmp/data/products/prices.md", "/toto/products/prices.md"],
    ],
  },
];
