export default [
  {
    message: "should properly serialize mail addresses",
    input: [
      {
        schema: "mailto",
        domain: "",
        path: "foo@bar.baz",
        query: {},
        fragment: "",
      },
    ],
    control: "mailto:foo@bar.baz",
  },
  {
    message: "should keep paths if there is no schema nor domains - 1",
    input: [
      {
        schema: "",
        domain: "",
        path: "foo/bar/my/path.txt",
        query: {},
        fragment: "",
      },
    ],
    control: "foo/bar/my/path.txt",
  },
  {
    message: "should keep paths if there is no schema nor domains - 2",
    input: [
      {
        schema: "",
        domain: "",
        path: "./foo/bar/my/path.txt",
        query: {},
        fragment: "",
      },
    ],
    control: "./foo/bar/my/path.txt",
  },
  {
    message: "should keep paths if there is no schema nor domains - 3",
    input: [
      {
        schema: "",
        domain: "",
        path: "../foo/bar/my/path.txt",
        query: {},
        fragment: "",
      },
    ],
    control: "../foo/bar/my/path.txt",
  },
  {
    message: "should keep relative paths if there is no domains defined",
    input: [
      {
        schema: "http",
        domain: "",
        path: "../foo/bar/my/path.txt",
        query: {},
        fragment: "",
      },
    ],
    control: "http:../foo/bar/my/path.txt",
  },
  {
    message: "should add a slash if there is a schema and domain",
    input: [
      {
        schema: "https",
        domain: "foo.bar",
        path: "../foo/bar/my/path.txt",
        query: {},
        fragment: "",
      },
    ],
    control: "https://foo.bar/../foo/bar/my/path.txt",
  },
];
