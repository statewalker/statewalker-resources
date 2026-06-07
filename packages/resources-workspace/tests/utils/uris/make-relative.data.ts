export default [
  {
    message: "should properly resolve relative URLs",
    baseUrl: "file:///foo/bar/baz",
    list: [
      ["file:///foo/bar/abc", "./abc"],
      ["file:///foo/bar/abc/", "./abc/"],
      ["file:///foo/abc", "../abc"],
      ["file:///foo/abc/", "../abc/"],
      ["file:///foo/bar/abc/cde", "./abc/cde"],
      ["file:///foo/bar/abc/cde/", "./abc/cde/"],
      ["file:///xyz", "../../xyz"],
      ["file:///foo/bar/baz", "./baz"],
      ["file:///foo/bar/baz/", "./baz/"],
    ],
  },
  {
    message: "should properly resolve relative URLs from a base URL with the ending slash - 1",
    baseUrl: "file:///foo/bar/baz/",
    list: [
      ["file:///foo/bar/abc", "../abc"],
      ["file:///foo/bar/abc/", "../abc/"],
      ["file:///foo/abc", "../../abc"],
      ["file:///foo/abc/", "../../abc/"],
      ["file:///foo/bar/abc/cde", "../abc/cde"],
      ["file:///foo/bar/abc/cde/", "../abc/cde/"],
      ["file:///xyz", "../../../xyz"],
      ["file:///foo/bar/baz", "../baz"],
      ["file:///foo/bar/baz/", "./"],
    ],
  },
  {
    message: "should properly resolve relative URLs from a base URL with the ending slash - 2",
    baseUrl: "file:///tmp/",
    list: [["file:///tmp/", "./"]],
  },
  {
    message: "should keep absolute URLs intact",
    baseUrl: "file:///foo/bar/baz",
    list: [
      ["http://www.google.com/", "http://www.google.com/"],

      [
        "https://api.observablehq.com/@fil/lasso-selection.js?v=3",
        "https://api.observablehq.com/@fil/lasso-selection.js?v=3",
      ],
    ],
  },
];
