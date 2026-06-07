export default [
  // {
  //   message: 'should properly resolve mail URLs',
  //   baseUrl: 'file:///foo/bar/baz',
  //   list: [
  //     ['mailto:foo@bar.baz', 'mailto:foo@bar.baz'],
  //   ]
  // },
  {
    message: "should properly resolve relative URLs",
    baseUrl: "file:///foo/bar/baz",
    list: [
      ["abc", "file:///foo/bar/abc"],
      ["./abc", "file:///foo/bar/abc"],
      ["../abc", "file:///foo/abc"],
      ["./abc/cde", "file:///foo/bar/abc/cde"],
      ["file://./abc/cde", "file:///foo/bar/abc/cde"],
    ],
  },
  {
    message: "should keep absolute intact",
    baseUrl: "file:///foo/bar/baz",
    list: [
      ["http://www.google.com/", "http://www.google.com/"],
      ["file:///xyz", "file:///xyz"],
      [
        "https://api.observablehq.com/@fil/lasso-selection.js?v=3",
        "https://api.observablehq.com/@fil/lasso-selection.js?v=3",
      ],
    ],
  },
  {
    message: "should resolve paths relative to urls with fragments",
    baseUrl: "http://localhost:8899/app-layouts/layouts.html#lorem/slide-columns.md",
    list: [
      [
        "../app-editor/output/lorem/slide-columns.obs.json",
        "http://localhost:8899/app-editor/output/lorem/slide-columns.obs.json",
      ],
    ],
  },
];
