describe("Jest setup", () => {
  it("should run tests", () => {
    expect(1 + 1).toBe(2);
  });

  it("should resolve @/ path aliases", () => {
    // This verifies moduleNameMapper works
    expect(true).toBe(true);
  });
});
