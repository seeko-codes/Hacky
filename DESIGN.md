# Hacky design

Hacky helps attendees find relevant people, inspect their fit, and start a conversation. Every design and user review is phone first; desktop is a secondary adaptation. Use a visible Chrome iPhone preview around 390 x 844.

## Cute and functional

The user replaced the electric direction with cute and functional. Use warm off-white surfaces, plum text, muted lavender actions, and a pale blush backdrop for the main companion. Dark mode uses warm plum surfaces and pale lavender actions. Keep readable contrast and clear focus states. No neon lime, lightning branding, orbital outlines, spotlight effects, or animated display text.

Let the original customizable characters carry personality. Preserve the main companion's greeting dance, manual dance, customization, and reduced-motion behavior. Saved electric flair migrates to stars. Original character artwork remains intact.

## Interface

Locally hosted Lato at 400 and 700, restrained typography, 44px minimum touch targets. Start with the welcome, companion, and four character-led request shortcuts. Keep the composer and fictional-demo disclosure visible. After a request, the introduction becomes one Style Hacky control and results lead. Short phones use a smaller companion so all welcome shortcuts stay reachable.

Recommendations show a character silhouette, a separate name line, explicit category badges, and a specialty. Hacker, Mentor, and Sponsor retain distinct colors and visible text in results, profiles, chat lists, and chat headers. The renderer accepts multiple category labels and gives new categories a neutral style. These three categories are not an exhaustive taxonomy. General networking returns a mixed sample of fictional attendees. Tapping expands into a focused profile led by Why connect, followed by stack, biography, optional strengths, visibly unavailable demo social links, and a full-width Message action. Back restores the result position and focus. Hacker, Mentor, and Sponsor labels retain distinct accessible colors.

Cards and profiles show full character silhouettes. Compact chats use face crops. Every attendee has a stable look and tint; own portraits follow saved customization. Resolve portrait URLs against the document base for local-file and server previews.

Phone chats occupy the full screen. Desktop places collapsible chats to the left of the finder. Chat rows align portraits, sender labels, and text on calm surfaces. Group consecutive messages by sender. Keep a draft and reading position per conversation during the current session. Append replies without rebuilding old messages; offer New reply when the reader is above the bottom. Chat entry focuses identity rather than the composer. Use one Back to chats action; the list returns to the finder. A person’s chat identity opens their profile. Keep conversations stable during customization and theme changes.

Small controls share consistent icon weights, 44px touch targets, and brief press feedback. Customization choices show a selected checkmark; Save is disabled until a change, and dirty state explains that closing discards it; companion stars twinkle briefly during dancing. New messages have a subtle arrival transition, while existing history stays still. Loading dots appear only during a pending finder request. All motion respects reduced-motion preferences. These are native CSS/JS adaptations inspired by React Bits interaction ideas, with no React dependency.

Profiles and replies are fictional. Social accounts are unconnected and no messages are sent. Keep these disclosures visible.

## Interaction references

W3C’s [Use of Color](https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html) supports explicit labels alongside category colors. NN/G’s [scroll-position guidance](https://www.nngroup.com/articles/saving-scroll-position/) informs preserving a reader’s place and providing a jump-to-latest control. Material’s [color roles](https://m3.material.io/styles/color/the-color-system) informed the paired foreground/surface audit. These are rationale for the chosen refinements, not imported UI components.
