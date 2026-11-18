import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatWidget from "@/components/ChatWidget";
import { expectNoA11yViolations } from "../helpers/axe";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const context = { placeName: "Delhi, India", usAqi: 180 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(json({ reply: "Wear a fitted N95." }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call]?.[1].body);

async function open(chatContext: typeof context | null = context) {
  const user = userEvent.setup();
  const view = render(<ChatWidget context={chatContext} />);
  await user.click(screen.getByRole("button", { name: /ask the assistant/i }));
  const ask = async (text: string) => {
    await user.type(screen.getByLabelText("Your question"), `${text}{Enter}`);
  };
  return { user, ask, ...view };
}

describe("ChatWidget", () => {
  it("starts closed, then opens a labelled dialog with focus in the input", async () => {
    const user = userEvent.setup();
    render(<ChatWidget context={context} />);
    const launcher = screen.getByRole("button", { name: /ask the assistant/i });
    expect(launcher).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(launcher);
    expect(screen.getByRole("dialog", { name: /air quality assistant chat/i })).toBeInTheDocument();
    expect(launcher).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Your question")).toHaveFocus();
    expect(screen.getByText(/today's reading for Delhi, India/)).toBeInTheDocument();
  });

  it("closes with Escape or the Close button and returns focus to the launcher", async () => {
    const { user } = await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ask the assistant/i })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: /ask the assistant/i }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ask the assistant/i }));
    await user.click(screen.getByRole("button", { name: /ask the assistant/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends a question with the context and shows the reply", async () => {
    const { ask } = await open();
    await ask("Which mask should I wear?");

    expect(await screen.findByText("Wear a fitted N95.")).toBeInTheDocument();
    expect(screen.getByText("Which mask should I wear?")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat");
    expect(bodyOf(0)).toEqual({
      messages: [{ role: "user", content: "Which mask should I wear?" }],
      context,
    });
    expect(screen.getByLabelText("Your question")).toHaveValue("");
  });

  it("omits the context when no reading is on screen", async () => {
    const { ask } = await open(null);
    await ask("Hello");
    await screen.findByText("Wear a fitted N95.");
    expect(bodyOf(0)).not.toHaveProperty("context");
    expect(screen.queryByText(/today's reading/)).not.toBeInTheDocument();
  });

  it("sends a suggested question when it is clicked", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Which mask should I wear?" }));
    expect(await screen.findByText("Wear a fitted N95.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Which mask should I wear?" })).toBeNull();
  });

  it("ignores empty input", async () => {
    const { user } = await open();
    await user.type(screen.getByLabelText("Your question"), "   {Enter}");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows server, generic and network errors and leaves them out of the history", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { message: "Assistant is down." } }, 502))
      .mockResolvedValueOnce(new Response("<html>", { status: 500 }))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json({ reply: "Back online." }));
    const { ask } = await open();

    await ask("one");
    expect(await screen.findByText("Assistant is down.")).toBeInTheDocument();
    await ask("two");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    await ask("three");
    expect(await screen.findByText(/network problem/i)).toBeInTheDocument();
    await ask("four");
    expect(await screen.findByText("Back online.")).toBeInTheDocument();

    expect(bodyOf(3).messages.map((m: { content: string }) => m.content)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    expect(bodyOf(3).messages.every((m: { role: string }) => m.role === "user")).toBe(true);
  });

  it("ignores a second question while one is pending", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const { ask } = await open();
    await ask("first");
    expect(await screen.findByText(/assistant is typing/i)).toBeInTheDocument();
    await ask("second");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve(json({ reply: "Done." }));
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });

  it("sends at most 8 messages and always starts with a user turn", async () => {
    const { ask } = await open();
    for (let i = 1; i <= 6; i++) {
      await ask(`question ${i}`);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(i));
      await waitFor(() => expect(screen.queryByText(/assistant is typing/i)).toBeNull());
    }
    const { messages } = bodyOf(5);
    expect(messages.length).toBeLessThanOrEqual(8);
    expect(messages[0].role).toBe("user");
    expect(messages.at(-1)).toEqual({ role: "user", content: "question 6" });
  });

  it("has no accessibility violations open or mid-conversation", async () => {
    const { ask, container } = await open();
    await expectNoA11yViolations(container);
    await ask("Hello");
    await screen.findByText("Wear a fitted N95.");
    await expectNoA11yViolations(container);
  });
});
