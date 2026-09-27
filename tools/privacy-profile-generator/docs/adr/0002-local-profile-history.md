# Generate and Retain Profiles Locally

The initial release generates one profile at a time and keeps all generated profile history in persistent browser-local storage, without sending profiles or history to a server. The app imposes no history count or expiry limit and provides a manual action to clear the saved history; entries remain after refresh until cleared by the user or browser, subject to browser storage capacity. This supports the privacy purpose of the tool; a server can be reconsidered if future features require one.
