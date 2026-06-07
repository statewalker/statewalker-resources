export default [
  {
    message: "should properly concatanate two paths",
    input: ["foo/bar/", "my/path.txt"],
    control: {
      schema: "",
      domain: "",
      path: "foo/bar/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should two relative paths",
    input: ["./foo/bar/", "./my/path.txt"],
    control: {
      schema: "",
      domain: "",
      path: "./foo/bar/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join absolute and a relative path",
    input: ["/foo/bar/", "./my/path.txt"],
    control: {
      schema: "",
      domain: "",
      path: "/foo/bar/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join a relative and an absolute paths",
    input: ["./foo/bar/", "/my/path.txt"],
    control: {
      schema: "",
      domain: "",
      path: "./foo/bar/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join paths with schemas and domains - 1",
    input: ["http://foo.bar/a/b/", "/my/path.txt"],
    control: {
      schema: "http",
      domain: "foo.bar",
      path: "/a/b/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join paths with schemas and domains - 2",
    input: ["http://foo.bar/a/b/", "http://foo.bar/my/path.txt"],
    control: {
      schema: "http",
      domain: "foo.bar",
      path: "/a/b/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join paths with different schemas and and domains - 1",
    input: ["http://foo.bar/a/b/", "https://google.com/my/path.txt"],
    control: {
      schema: "http",
      domain: "foo.bar",
      path: "/a/b/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join paths with different schemas and and domains - 2",
    input: ["./a/b/", "https://google.com/my/path.txt"],
    control: {
      schema: "",
      domain: "",
      path: "./a/b/my/path.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join paths and keep the last query",
    input: ["./a/b/", "https://google.com/my/path.txt?q=mysearch"],
    control: {
      schema: "",
      domain: "",
      path: "./a/b/my/path.txt",
      query: { q: "mysearch" },
      fragment: "",
    },
  },
  {
    message: "should join multiple paths",
    input: ["./a/b/", "c/d", "/e/f", "./g/h.txt"],
    control: {
      schema: "",
      domain: "",
      path: "./a/b/c/d/e/f/g/h.txt",
      query: {},
      fragment: "",
    },
  },
  {
    message: "should join fragments",
    input: ["./a/b/#x", "c/d#y", "/e/f#z", "./g/h.txt#/my/fragment/Hello"],
    control: {
      schema: "",
      domain: "",
      path: "./a/b/c/d/e/f/g/h.txt",
      query: {},
      fragment: "#/my/fragment/Hello",
    },
  },
];
