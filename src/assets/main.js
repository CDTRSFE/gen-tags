(function() {
    const vscode = acquireVsCodeApi();

    const query = e => document.querySelector(e);
    const queryAll = e => document.querySelectorAll(e);
    const postMsg = (type, data) => vscode.postMessage({ type, data });

    // const oldState = vscode.getState();
    // setTimeout(postMsg('init'), 1000);

    const prefixDom = query('#prefix');
    const suffixDom = query('#suffix');
    const versionTypeDom = query('#versionType');
    const editPkgDom = query('#editPkg');
    const submitBtn = query('#submitBtn');

    const formData = {
        prefix: '',
        suffix: '',
        versionType: 'patch',
        editPkg: true,
    };
    const updateForm = () => postMsg('formChange', formData);

    prefixDom.addEventListener('change', () => {
        formData.prefix = prefixDom.value;
        updateForm();
    });
    suffixDom.addEventListener('input', () => {
        formData.suffix = suffixDom.value;
        updateForm();
    });
    versionTypeDom.addEventListener('change', () => {
        formData.versionType = versionTypeDom.value;
        updateForm();
    });
    editPkgDom.addEventListener('change', () => {
        formData.editPkg = editPkgDom.checked;
        updateForm();
    });
    submitBtn.addEventListener('click', () => {
        postMsg('submit', formData);
    });

    const setPrefixOptions = (data) => {
        const options = data.map((item, index) => {
            return `<option ${index === 0 ? 'selected' : ''} value="${item}">${item}</option>`;
        });
        prefixDom.innerHTML = options.join('');
        formData.prefix = data[0] || '';
        updateForm();
    };
    const updateTag = (tag) => {
        const tagDom = query('#tag');
        tagDom.innerHTML = tag;
    };
    
    window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.type) {
            case 'prefixOptions':
                setPrefixOptions(msg.data);
                break;
            case 'updateTag':
                updateTag(msg.data);
                break;
            case 'disableSubmit':
                submitBtn.disabled = msg.data;
                break;
        }
    });
})();
